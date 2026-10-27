// Recursive-descent parser for the subset of Java the course uses.
import { lex, CompileError } from './lexer.js';

const PRIMS = new Set(['int', 'double', 'boolean', 'char', 'long', 'float', 'short', 'byte', 'void']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'default', 'synchronized', 'native', 'transient', 'volatile', 'strictfp']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=']);

const BINARY_PREC = [
  ['||'],
  ['&&'],
  ['|'],
  ['^'],
  ['&'],
  ['==', '!='],
  ['<', '>', '<=', '>=', 'instanceof'],
  ['<<', '>>', '>>>'],
  ['+', '-'],
  ['*', '/', '%']
];

export function parse(src, file) {
  const p = new Parser(lex(src, file), file);
  return p.compilationUnit();
}

function describe(tok) {
  if (tok.t === 'eof') return 'the end of the file';
  if (tok.t === 'str') return 'a string';
  return `'${tok.v}'`;
}

class Parser {
  constructor(tokens, file) {
    this.toks = tokens;
    this.i = 0;
    this.file = file;
  }

  peek(k = 0) { return this.toks[Math.min(this.i + k, this.toks.length - 1)]; }
  next() { return this.toks[this.i++]; }
  prev() { return this.toks[this.i - 1]; }
  is(v, k = 0) { const t = this.peek(k); return (t.t === 'op' || t.t === 'kw') && t.v === v; }
  isId(k = 0) { return this.peek(k).t === 'id'; }
  accept(v) { if (this.is(v)) { return this.next(); } return null; }
  pos(tok = this.peek()) { return { file: this.file, line: tok.line, col: tok.col }; }
  endPos() {
    const t = this.prev() || this.peek();
    return { file: this.file, line: t.endLine, col: t.endCol };
  }

  fail(msg, tok = this.peek(), hint) {
    throw new CompileError(msg, this.pos(tok), hint);
  }

  expect(v, what) {
    if (this.is(v)) return this.next();
    const tok = this.peek();
    if (v === ';' || v === ')' || v === ']') {
      // report right after the previous token like javac does
      const hint = v === ';' ? 'Every statement in Java ends with a semicolon.' : null;
      throw new CompileError(`'${v}' expected${what ? ' ' + what : ''}`, this.endPos(), hint);
    }
    if (v === '}' && tok.t === 'eof') {
      throw new CompileError("Reached the end of the file but a '{' was never closed. Add a matching '}'.", this.endPos());
    }
    this.fail(`'${v}' expected${what ? ' ' + what : ''}, but found ${describe(tok)}`);
  }

  ident(what = 'a name') {
    const t = this.peek();
    if (t.t === 'id') return this.next().v;
    if (t.t === 'kw') this.fail(`'${t.v}' is a reserved word in Java and can't be used as ${what}`);
    this.fail(`Expected ${what}, but found ${describe(t)}`);
  }

  // ---------- top level ----------
  compilationUnit() {
    const unit = { k: 'Unit', file: this.file, types: [], imports: [] };
    if (this.is('package')) {
      this.next();
      this.qualifiedName();
      this.expect(';');
    }
    while (this.is('import')) {
      const t = this.next();
      this.accept('static');
      let name = this.ident();
      while (this.accept('.')) {
        if (this.accept('*')) { name += '.*'; break; }
        name += '.' + this.ident();
      }
      this.expect(';');
      unit.imports.push({ name, pos: this.pos(t) });
    }
    while (this.peek().t !== 'eof') {
      if (this.accept(';')) continue;
      unit.types.push(this.typeDecl());
    }
    return unit;
  }

  qualifiedName() {
    let name = this.ident();
    while (this.is('.') && this.isId(1)) { this.next(); name += '.' + this.ident(); }
    return name;
  }

  modifiers() {
    const mods = new Set();
    const annos = [];
    while (true) {
      const t = this.peek();
      if (t.t === 'op' && t.v === '@' && !(this.is('interface', 1))) {
        this.next();
        const name = this.qualifiedName();
        if (this.accept('(')) {
          let depth = 1;
          while (depth > 0 && this.peek().t !== 'eof') {
            const x = this.next();
            if (x.v === '(') depth++;
            else if (x.v === ')') depth--;
          }
        }
        annos.push({ name, pos: this.pos(t) });
        continue;
      }
      if (t.t === 'kw' && MODIFIERS.has(t.v) && !(t.v === 'default' && (this.is(':', 1) || this.is('->', 1)))) {
        if (mods.has(t.v)) this.fail(`'${t.v}' is written twice`);
        mods.add(t.v);
        this.next();
        continue;
      }
      break;
    }
    return { mods, annos };
  }

  typeDecl() {
    const start = this.peek();
    const { mods, annos } = this.modifiers();
    const kwTok = this.peek();
    if (this.is('enum')) this.fail('Enums are not supported in this sandbox yet. Use static final constants instead.');
    if (this.is('record')) this.fail('Records are not supported in this sandbox. Write a normal class instead.');
    let kind;
    if (this.accept('class')) kind = 'class';
    else if (this.accept('interface')) kind = 'interface';
    else if (this.is('@') && this.is('interface', 1)) this.fail('Annotation types are not supported.');
    else {
      const t = this.peek();
      if (t.t === 'id' || PRIMS.has(t.v)) {
        this.fail(`Expected 'class' or 'interface' here. Methods and variables must go inside a class's { }.`, t);
      }
      this.fail(`Expected 'class' or 'interface', but found ${describe(t)}`);
    }
    const nameTok = this.peek();
    const name = this.ident('a class name');
    if (this.is('<')) this.fail('Generic classes (class Box<T>) are not supported in this sandbox.');
    const decl = {
      k: 'Class', kind, name, mods, annos, ext: null, impls: [], members: [],
      pos: this.pos(kwTok), namePos: this.pos(nameTok), startPos: this.pos(start), file: this.file
    };
    if (kind === 'class') {
      if (this.accept('extends')) decl.ext = this.type();
      if (this.is(',') && decl.ext) this.fail('A class can only extend one class. Use interfaces (implements) for more.');
      if (this.accept('implements')) {
        decl.impls.push(this.type());
        while (this.accept(',')) decl.impls.push(this.type());
      }
    } else {
      if (this.is('implements')) this.fail("An interface can't implement another interface. Use 'extends' instead.");
      if (this.accept('extends')) {
        decl.impls.push(this.type());
        while (this.accept(',')) decl.impls.push(this.type());
      }
    }
    this.expect('{', `to start the body of ${name}`);
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.expect('}');
      if (this.accept(';')) continue;
      decl.members.push(this.member(decl));
    }
    this.next();
    return decl;
  }

  member(cls) {
    const start = this.peek();
    const { mods, annos } = this.modifiers();
    if (this.is('class') || this.is('interface') || this.is('enum')) {
      this.fail(`Put each class at the top level of a file instead of inside ${cls.name}.`);
    }
    if (this.is('{')) this.fail('Initializer blocks are not supported. Use a constructor instead.');
    if (this.is('<')) this.fail('Generic methods (<T>) are not supported in this sandbox.');
    // constructor
    if (this.isId() && this.peek().v === cls.name && this.is('(', 1)) {
      const nameTok = this.next();
      const params = this.params();
      this.throwsClause();
      const body = this.block();
      return { k: 'Ctor', mods, annos, name: cls.name, params, body, pos: this.pos(nameTok), startPos: this.pos(start) };
    }
    // method without return type: probably a misspelled constructor
    if (this.isId() && this.is('(', 1)) {
      const t = this.peek();
      this.fail(`Method '${t.v}' needs a return type (like void or int). If it's a constructor, its name must match the class: ${cls.name}.`, t);
    }
    const type = this.type(true);
    const nameTok = this.peek();
    const name = this.ident('a name');
    if (this.is('(')) {
      const params = this.params();
      let dims = 0;
      while (this.is('[') && this.is(']', 1)) { this.next(); this.next(); dims++; }
      if (dims) type.dims += dims;
      this.throwsClause();
      let body = null;
      if (this.is('{')) body = this.block();
      else this.expect(';', 'or a method body { }');
      return { k: 'Method', mods, annos, ret: type, name, params, body, pos: this.pos(nameTok), startPos: this.pos(start) };
    }
    if (type.name === 'void') this.fail("A field can't have type void", nameTok);
    const vars = [this.varDeclRest(name, nameTok)];
    while (this.accept(',')) {
      const t = this.peek();
      vars.push(this.varDeclRest(this.ident(), t));
    }
    this.expect(';');
    return { k: 'Field', mods, annos, type, vars, pos: this.pos(start) };
  }

  throwsClause() {
    if (this.accept('throws')) {
      this.type();
      while (this.accept(',')) this.type();
    }
  }

  params() {
    this.expect('(');
    const params = [];
    if (!this.is(')')) {
      do {
        const { mods } = this.modifiers();
        const type = this.type();
        let varargs = false;
        if (this.accept('...')) { varargs = true; type.dims++; }
        const t = this.peek();
        const name = this.ident('a parameter name');
        while (this.is('[') && this.is(']', 1)) { this.next(); this.next(); type.dims++; }
        params.push({ type, name, varargs, final: mods.has('final'), pos: this.pos(t) });
      } while (this.accept(','));
    }
    this.expect(')', 'to close the parameter list');
    return params;
  }

  varDeclRest(name, tok) {
    let dims = 0;
    while (this.accept('[')) { this.expect(']'); dims++; }
    let init = null;
    if (this.accept('=')) {
      init = this.is('{') ? this.arrayInit() : this.expr();
    }
    return { name, dims, init, pos: this.pos(tok) };
  }

  arrayInit() {
    const t = this.expect('{');
    const elems = [];
    while (!this.is('}')) {
      elems.push(this.is('{') ? this.arrayInit() : this.expr());
      if (!this.accept(',')) break;
    }
    this.expect('}', 'to close the array values');
    return { k: 'ArrayInit', elems, pos: this.pos(t) };
  }

  // ---------- types ----------
  type(allowVoid = false) {
    const t = this.peek();
    let name;
    if (t.t === 'kw' && PRIMS.has(t.v)) {
      if (t.v === 'void' && !allowVoid) this.fail("'void' can only be used as a method's return type");
      name = this.next().v;
    } else if (t.t === 'id') {
      name = this.next().v;
      while (this.is('.') && this.isId(1)) { this.next(); name = this.next().v; }
    } else {
      this.fail(`Expected a type (like int, String or a class name), but found ${describe(t)}`);
    }
    let args = null;
    if (this.is('<') && !PRIMS.has(name)) {
      this.next();
      args = [];
      if (!this.is('>')) {
        do {
          if (this.accept('?')) {
            if (this.accept('extends') || this.accept('super')) args.push(this.type());
            else args.push({ k: 'Type', name: 'Object', args: null, dims: 0, pos: this.pos() });
          } else {
            const at = this.type();
            if (PRIMS.has(at.name) && at.dims === 0) {
              const box = { int: 'Integer', double: 'Double', boolean: 'Boolean', char: 'Character', long: 'Long', float: 'Float', short: 'Short', byte: 'Byte' }[at.name];
              this.fail(`Generics can't use primitive types. Use ${box} instead of ${at.name}.`, t);
            }
            args.push(at);
          }
        } while (this.accept(','));
      }
      this.closeAngle();
    }
    let dims = 0;
    while (this.is('[') && this.is(']', 1)) { this.next(); this.next(); dims++; }
    return { k: 'Type', name, args, dims, pos: this.pos(t) };
  }

  closeAngle() {
    const t = this.peek();
    if (t.t === 'op' && (t.v === '>>' || t.v === '>>>' || t.v === '>=' || t.v === '>>=')) {
      // split the token
      const rest = t.v.slice(1);
      this.toks.splice(this.i, 1, { ...t, v: '>' }, { ...t, v: rest, col: t.col + 1 });
    }
    this.expect('>', 'to close the < >');
  }

  // try to parse "Type name" without consuming on failure
  looksLikeLocalDecl() {
    const save = this.i;
    const saveToks = this.toks;
    try {
      const t = this.peek();
      if (t.t !== 'id') return false;
      this.toks = this.toks.slice();
      this.type();
      const ok = this.isId() && (this.is('=', 1) || this.is(';', 1) || this.is(',', 1) || this.is('[', 1) || this.is(':', 1));
      return ok;
    } catch (e) {
      return false;
    } finally {
      this.i = save;
      this.toks = saveToks;
    }
  }

  // ---------- statements ----------
  block() {
    const t = this.expect('{');
    const body = [];
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.expect('}');
      body.push(this.statement());
    }
    const end = this.next();
    return { k: 'Block', body, pos: this.pos(t), endPos: this.pos(end) };
  }

  localDecl(final) {
    const type = this.type();
    const vars = [];
    do {
      const t = this.peek();
      vars.push(this.varDeclRest(this.ident('a variable name'), t));
    } while (this.accept(','));
    return { k: 'Local', type, vars, final, pos: type.pos };
  }

  statement() {
    const t = this.peek();
    const pos = this.pos(t);
    if (t.t === 'op') {
      if (t.v === '{') return this.block();
      if (t.v === ';') { this.next(); return { k: 'Empty', pos }; }
    }
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': {
          this.next();
          this.expect('(', "after 'if'");
          const cond = this.expr();
          this.expect(')', 'to close the if condition');
          if (this.is(';')) {
            throw new CompileError("There's a ';' right after this if (...). That ends the if, so the next line always runs. Remove the ';'.", this.pos());
          }
          const then = this.statement();
          let els = null;
          if (this.accept('else')) els = this.statement();
          return { k: 'If', cond, then, else: els, pos };
        }
        case 'else':
          this.fail("This 'else' has no matching 'if'. Check the { } braces just above it.");
          break;
        case 'while': {
          this.next();
          this.expect('(', "after 'while'");
          const cond = this.expr();
          this.expect(')', 'to close the while condition');
          if (this.is(';')) {
            throw new CompileError("There's a ';' right after while (...). That makes an empty loop. Remove the ';'.", this.pos());
          }
          return { k: 'While', cond, body: this.statement(), pos };
        }
        case 'do': {
          this.next();
          const body = this.statement();
          this.expect('while', "after the do { } block");
          this.expect('(');
          const cond = this.expr();
          this.expect(')');
          this.expect(';');
          return { k: 'DoWhile', cond, body, pos };
        }
        case 'for': return this.forStatement();
        case 'return': {
          this.next();
          const e = this.is(';') ? null : this.expr();
          this.expect(';');
          return { k: 'Return', e, pos };
        }
        case 'break': this.next(); if (this.isId()) this.fail('Labeled break is not supported.'); this.expect(';'); return { k: 'Break', pos };
        case 'continue': this.next(); if (this.isId()) this.fail('Labeled continue is not supported.'); this.expect(';'); return { k: 'Continue', pos };
        case 'throw': {
          this.next();
          const e = this.expr();
          this.expect(';');
          return { k: 'Throw', e, pos };
        }
        case 'switch': return this.switchStatement();
        case 'try': return this.tryStatement();
        case 'final': {
          this.next();
          const d = this.localDecl(true);
          this.expect(';');
          return d;
        }
        case 'class': case 'interface': case 'public': case 'private': case 'static': case 'protected':
          if (t.v === 'class' || t.v === 'interface') this.fail('Classes must be declared at the top level, not inside a method.');
          this.fail(`'${t.v}' can't be used inside a method. Did you forget a '}' to close the method above?`);
          break;
        case 'case': case 'default':
          this.fail(`'${t.v}' can only appear inside a switch`);
          break;
        default:
          if (PRIMS.has(t.v) && t.v !== 'void') {
            const d = this.localDecl(false);
            this.expect(';');
            return d;
          }
          if (t.v === 'void') {
            this.fail("A method can't be declared inside another method. Did you forget a '}' to close the method above?");
          }
      }
    }
    if (t.t === 'id' && t.v === 'var' && this.isId(1)) {
      this.next();
      const nameTok = this.peek();
      const v = this.varDeclRest(this.ident(), nameTok);
      this.expect(';');
      return { k: 'Local', type: { k: 'Type', name: 'var', args: null, dims: 0, pos }, vars: [v], final: false, pos };
    }
    if (t.t === 'id' && this.looksLikeLocalDecl()) {
      const d = this.localDecl(false);
      this.expect(';');
      return d;
    }
    // expression statement
    const e = this.expr();
    if (!['Assign', 'Call', 'New', 'CtorCall'].includes(e.k) && !(e.k === 'Unary' && (e.op === '++' || e.op === '--')) && e.k !== 'Postfix') {
      if (this.isId() && (e.k === 'Name' || e.k === 'Field')) {
        throw new CompileError(`Unknown type '${exprText(e)}'. Check the spelling, including capital letters.`, e.pos);
      }
      throw new CompileError('Not a statement. This line computes a value but does nothing with it.', e.pos,
        e.k === 'Binary' && e.op === '==' ? 'Did you mean = (assign) instead of == (compare)?' : 'A statement should assign a variable, call a method, or create an object.');
    }
    this.expect(';');
    return { k: 'Expr', e, pos };
  }

  forStatement() {
    const pos = this.pos();
    this.next();
    this.expect('(', "after 'for'");
    // for-each?
    const save = this.i;
    let isEach = false;
    {
      const saveToks = this.toks;
      try {
        this.toks = this.toks.slice();
        this.accept('final');
        if (this.peek().t === 'id' || PRIMS.has(this.peek().v)) {
          this.type();
          if (this.isId() && this.is(':', 1)) isEach = true;
        }
      } catch (e) { /* not a for-each */ }
      this.i = save;
      this.toks = saveToks;
    }
    if (isEach) {
      this.accept('final');
      const type = this.type();
      const nameTok = this.peek();
      const name = this.ident();
      this.expect(':');
      const iter = this.expr();
      this.expect(')');
      return { k: 'ForEach', type, name, namePos: this.pos(nameTok), iter, body: this.statement(), pos };
    }
    const init = [];
    if (!this.is(';')) {
      const t = this.peek();
      const isDecl = (t.t === 'kw' && (PRIMS.has(t.v) || t.v === 'final')) || (t.t === 'id' && (this.looksLikeLocalDecl() || (t.v === 'var' && this.isId(1))));
      if (isDecl) {
        const final = !!this.accept('final');
        if (this.peek().v === 'var' && this.isId(1)) {
          this.next();
          const nameTok = this.peek();
          init.push({ k: 'Local', type: { k: 'Type', name: 'var', args: null, dims: 0, pos: this.pos(t) }, vars: [this.varDeclRest(this.ident(), nameTok)], final, pos: this.pos(t) });
        } else {
          init.push(this.localDecl(final));
        }
      } else {
        do { const e = this.expr(); init.push({ k: 'Expr', e, pos: e.pos }); } while (this.accept(','));
      }
    }
    if (this.is(',')) this.fail("Use ';' to separate the three parts of a for loop: for (start; condition; step)");
    this.expect(';', 'after the start of the for loop');
    const cond = this.is(';') ? null : this.expr();
    this.expect(';', 'after the for-loop condition');
    const update = [];
    if (!this.is(')')) {
      do { update.push(this.expr()); } while (this.accept(','));
    }
    this.expect(')', 'to close the for loop header');
    if (this.is(';')) {
      throw new CompileError("There's a ';' right after for (...). That makes an empty loop. Remove the ';'.", this.pos());
    }
    return { k: 'For', init, cond, update, body: this.statement(), pos };
  }

  switchStatement() {
    const pos = this.pos();
    this.next();
    this.expect('(');
    const disc = this.expr();
    this.expect(')');
    this.expect('{');
    const cases = [];
    let arrowStyle = null;
    while (!this.is('}')) {
      const ct = this.peek();
      let labels;
      if (this.accept('default')) labels = null;
      else if (this.accept('case')) {
        labels = [this.ternary()];
        while (this.accept(',')) labels.push(this.ternary());
      } else {
        this.fail("Expected 'case' or 'default' inside the switch");
      }
      let arrow;
      if (this.accept('->')) arrow = true;
      else { this.expect(':', 'after the case value'); arrow = false; }
      if (arrowStyle === null) arrowStyle = arrow;
      else if (arrowStyle !== arrow) this.fail("Don't mix 'case X:' and 'case X ->' in the same switch", ct);
      const body = [];
      if (arrow) {
        if (this.is('{')) body.push(this.block());
        else if (this.is('throw')) body.push(this.statement());
        else {
          const e = this.expr();
          this.expect(';');
          body.push({ k: 'Expr', e, pos: e.pos });
        }
      } else {
        while (!this.is('case') && !this.is('default') && !this.is('}')) {
          if (this.peek().t === 'eof') this.expect('}');
          body.push(this.statement());
        }
      }
      cases.push({ labels, body, arrow, pos: this.pos(ct) });
    }
    this.next();
    return { k: 'Switch', disc, cases, arrow: !!arrowStyle, pos };
  }

  tryStatement() {
    const pos = this.pos();
    this.next();
    if (this.is('(')) this.fail('try-with-resources is not supported here.');
    const block = this.block();
    const catches = [];
    while (this.is('catch')) {
      const ct = this.next();
      this.expect('(');
      this.modifiers();
      const types = [this.type()];
      while (this.accept('|')) types.push(this.type());
      const nameTok = this.peek();
      const name = this.ident();
      this.expect(')');
      catches.push({ types, name, namePos: this.pos(nameTok), body: this.block(), pos: this.pos(ct) });
    }
    let fin = null;
    if (this.accept('finally')) fin = this.block();
    if (!catches.length && !fin) this.fail("A try block needs at least one 'catch' or a 'finally'");
    return { k: 'Try', block, catches, fin, pos };
  }

  // ---------- expressions ----------
  expr() {
    return this.assignment();
  }

  assignment() {
    const lhs = this.ternary();
    const t = this.peek();
    if (t.t === 'op' && ASSIGN_OPS.has(t.v)) {
      this.next();
      if (!['Name', 'Field', 'Index'].includes(lhs.k)) {
        throw new CompileError('You can only assign to a variable, a field or an array element', lhs.pos,
          t.v === '=' ? 'Did you mean == to compare?' : null);
      }
      const value = this.assignment();
      return { k: 'Assign', op: t.v, target: lhs, value, pos: lhs.pos, opPos: this.pos(t) };
    }
    return lhs;
  }

  ternary() {
    const cond = this.binary(0);
    if (this.is('?')) {
      const q = this.next();
      const a = this.ternary();
      this.expect(':', "in the ? : expression");
      const b = this.lambdaGuard() || this.ternary();
      return { k: 'Cond', cond, a, b, pos: cond.pos, qPos: this.pos(q) };
    }
    return cond;
  }

  lambdaGuard() { return null; }

  binary(level) {
    if (level >= BINARY_PREC.length) return this.unary();
    const ops = BINARY_PREC[level];
    let left = this.binary(level + 1);
    while (true) {
      const t = this.peek();
      if (!((t.t === 'op' || t.t === 'kw') && ops.includes(t.v))) break;
      this.next();
      if (t.v === 'instanceof') {
        this.accept('final');
        const type = this.type();
        let bind = null;
        if (this.isId()) bind = { name: this.next().v, pos: this.pos(this.prev()) };
        left = { k: 'InstanceOf', e: left, type, bind, pos: left.pos };
        continue;
      }
      const right = this.binary(level + 1);
      left = { k: 'Binary', op: t.v, l: left, r: right, pos: left.pos, opPos: this.pos(t) };
    }
    return left;
  }

  unary() {
    const t = this.peek();
    if (t.t === 'op') {
      if (t.v === '+' || t.v === '-' || t.v === '!' || t.v === '~' || t.v === '++' || t.v === '--') {
        this.next();
        // fold negative literals so -2147483648 works
        if (t.v === '-' && this.peek().t === 'num') {
          const nt = this.peek();
          const after = this.peek(1);
          if (!(after.t === 'op' && (after.v === '.' || after.v === '['))) {
            this.next();
            return this.postfix({ k: 'Lit', ty: nt.ty, v: -nt.v, pos: this.pos(t), raw: '-' + nt.raw });
          }
        }
        const e = this.unary();
        return { k: 'Unary', op: t.v, e, pos: this.pos(t) };
      }
      if (t.v === '(' && this.isCast()) {
        this.next();
        const type = this.type();
        this.expect(')');
        const e = this.unary();
        return { k: 'Cast', type, e, pos: this.pos(t) };
      }
    }
    return this.postfix(this.primary());
  }

  isCast() {
    // ( primitive ...) is always a cast
    const a = this.peek(1);
    if (a.t === 'kw' && PRIMS.has(a.v)) {
      return true;
    }
    if (a.t !== 'id') return false;
    // scan a type: Id(.Id)*(<...>)?([])* then ')'
    let k = 2;
    while (this.is('.', k) && this.peek(k + 1).t === 'id') k += 2;
    if (this.is('<', k)) {
      let depth = 0;
      while (true) {
        const t = this.peek(k);
        if (t.t === 'eof') return false;
        if (t.v === '<') depth++;
        else if (t.v === '>') depth--;
        else if (t.v === '>>') depth -= 2;
        else if (!(t.t === 'id' || t.v === ',' || t.v === '?' || t.v === '.' || t.v === '[' || t.v === ']' || t.v === 'extends')) return false;
        k++;
        if (depth <= 0) break;
      }
    }
    while (this.is('[', k) && this.is(']', k + 1)) k += 2;
    if (!this.is(')', k)) return false;
    const after = this.peek(k + 1);
    if (after.t === 'id' || after.t === 'str' || after.t === 'num' || after.t === 'char') return true;
    if (after.t === 'kw' && ['this', 'new', 'super', 'true', 'false', 'null'].includes(after.v)) return true;
    if (after.t === 'op' && (after.v === '(' || after.v === '!' || after.v === '~')) return true;
    return false;
  }

  postfix(e) {
    while (true) {
      const t = this.peek();
      if (t.t !== 'op') break;
      if (t.v === '.') {
        this.next();
        if (this.is('new')) this.fail('Inner class creation is not supported.');
        if (this.is('class')) this.fail('.class literals are not supported here.');
        const nt = this.peek();
        if (nt.t === 'kw' && nt.v === 'this') this.fail('Qualified this (X.this) is not supported.');
        const name = this.ident('a field or method name after the dot');
        if (this.is('(')) {
          const args = this.args();
          e = { k: 'Call', obj: e, name, args, pos: this.pos(nt), startPos: e.pos };
        } else {
          e = { k: 'Field', obj: e, name, pos: this.pos(nt), startPos: e.pos };
        }
        continue;
      }
      if (t.v === '[') {
        this.next();
        const idx = this.expr();
        this.expect(']');
        e = { k: 'Index', arr: e, idx, pos: e.pos, idxPos: this.pos(t) };
        continue;
      }
      if (t.v === '++' || t.v === '--') {
        this.next();
        e = { k: 'Postfix', op: t.v, e, pos: e.pos };
        continue;
      }
      if (t.v === '::') this.fail('Method references (::) are not supported here.');
      break;
    }
    return e;
  }

  args() {
    this.expect('(');
    const args = [];
    if (!this.is(')')) {
      do { args.push(this.expr()); } while (this.accept(','));
    }
    this.expect(')', 'to close the method call');
    return args;
  }

  primary() {
    const t = this.peek();
    const pos = this.pos(t);
    switch (t.t) {
      case 'num': this.next(); return { k: 'Lit', ty: t.ty, v: t.v, raw: t.raw, pos };
      case 'str': this.next(); return { k: 'Lit', ty: 'String', v: t.v, pos };
      case 'char': this.next(); return { k: 'Lit', ty: 'char', v: t.v, pos };
      case 'id': {
        this.next();
        if (this.is('->')) this.fail('Lambdas (->) are not supported in this sandbox.');
        if (this.is('(')) {
          const args = this.args();
          return { k: 'Call', obj: null, name: t.v, args, pos };
        }
        return { k: 'Name', name: t.v, pos };
      }
      case 'kw':
        switch (t.v) {
          case 'true': case 'false': this.next(); return { k: 'Lit', ty: 'boolean', v: t.v === 'true', pos };
          case 'null': this.next(); return { k: 'Lit', ty: 'null', v: null, pos };
          case 'this':
            this.next();
            if (this.is('(')) return { k: 'CtorCall', kind: 'this', args: this.args(), pos };
            return { k: 'This', pos };
          case 'super':
            this.next();
            if (this.is('(')) return { k: 'CtorCall', kind: 'super', args: this.args(), pos };
            if (!this.is('.')) this.fail("Expected '.' or '(' after 'super'");
            return { k: 'Super', pos };
          case 'new': return this.creator();
          default:
            if (PRIMS.has(t.v)) {
              this.fail(`Unexpected type '${t.v}' here. To declare a variable, start a new statement.`);
            }
        }
        break;
      case 'op':
        if (t.v === '(') {
          this.next();
          if (this.is(')') && this.is('->', 1)) this.fail('Lambdas (->) are not supported in this sandbox.');
          const e = this.expr();
          this.expect(')');
          if (this.is('->')) this.fail('Lambdas (->) are not supported in this sandbox.');
          return { k: 'Paren', e, pos };
        }
        if (t.v === '{') this.fail('Array values in { } can only be used when declaring an array, like int[] a = {1, 2};  Otherwise write new int[]{1, 2}.');
        break;
    }
    if (t.t === 'eof') throw new CompileError('The file ended in the middle of an expression', this.endPos());
    this.fail(`Unexpected ${describe(t)}. Expected a value or expression here.`);
  }

  creator() {
    const pos = this.pos();
    this.next();
    const t = this.peek();
    let type;
    if (t.t === 'kw' && PRIMS.has(t.v)) {
      type = { k: 'Type', name: this.next().v, args: null, dims: 0, pos: this.pos(t) };
    } else {
      let name = this.ident('a class name after new');
      while (this.is('.') && this.isId(1)) { this.next(); name = this.next().v; }
      let args = null;
      if (this.is('<')) {
        this.next();
        args = [];
        if (!this.is('>')) {
          do { args.push(this.type()); } while (this.accept(','));
        }
        this.closeAngle();
      }
      type = { k: 'Type', name, args, dims: 0, pos: this.pos(t) };
    }
    if (this.is('[')) {
      const dims = [];
      let extra = 0;
      while (this.is('[')) {
        this.next();
        if (this.is(']')) { this.next(); extra++; continue; }
        if (extra) this.fail('Array sizes must come before empty [] brackets');
        dims.push(this.expr());
        this.expect(']');
      }
      let init = null;
      if (this.is('{')) {
        if (dims.length) this.fail("Don't give a size when you list the values: use new int[]{1, 2, 3}");
        init = this.arrayInit();
      } else if (!dims.length) {
        this.fail('An array needs a size, like new int[5], or values, like new int[]{1, 2}');
      }
      return { k: 'NewArray', type, dims, extraDims: extra, init, pos };
    }
    if (this.is('(')) {
      const args = this.args();
      if (this.is('{')) this.fail('Anonymous classes are not supported. Write a named class instead.');
      return { k: 'New', type, args, pos };
    }
    this.fail(`Expected '(' after new ${type.name}, like new ${type.name}()`);
  }
}

export function exprText(e) {
  if (!e) return '';
  switch (e.k) {
    case 'Name': return e.name;
    case 'Field': return exprText(e.obj) + '.' + e.name;
    case 'This': return 'this';
    case 'Super': return 'super';
    case 'Call': return (e.obj ? exprText(e.obj) + '.' : '') + e.name + '(...)';
    case 'Lit': return e.ty === 'String' ? JSON.stringify(e.v) : String(e.raw ?? e.v);
    case 'Paren': return '(' + exprText(e.e) + ')';
    default: return 'expression';
  }
}
