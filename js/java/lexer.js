// Turns Java source text into tokens.

export class CompileError extends Error {
  constructor(message, pos, hint) {
    super(message);
    this.pos = pos || null;
    this.hint = hint || null;
  }
}

export const KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null', 'var'
]);

const OPERATORS = [
  '>>>=', '<<=', '>>=', '>>>', '...', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '>=',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '(', ')', '{', '}', '[', ']', ';', ',', '.', '@', '=', '<', '>', '!', '~', '?', ':', '+', '-',
  '*', '/', '&', '|', '^', '%'
];

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', s: ' ', '0': '\0', "'": "'", '"': '"', '\\': '\\' };

export function lex(src, file) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const n = src.length;

  const pos = () => ({ file, line, col });
  const advance = (k) => {
    for (let j = 0; j < k; j++) {
      if (src[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  };

  const readEscape = (p) => {
    // src[i] is the backslash
    const c = src[i + 1];
    if (c === 'u') {
      let j = i + 1;
      while (src[j] === 'u') j++;
      const hex = src.slice(j, j + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new CompileError('Bad unicode escape: \\u needs four hex digits', p);
      advance(j + 4 - i);
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (c in ESCAPES) {
      advance(2);
      return ESCAPES[c];
    }
    throw new CompileError(`Unknown escape sequence \\${c ?? ''}`, p, 'Valid escapes include \\n (new line), \\t (tab), \\" and \\\\.');
  };

  while (i < n) {
    const c = src[i];
    // whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f') { advance(1); continue; }
    // comments
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') advance(1);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const p = pos();
      advance(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) advance(1);
      if (i >= n) throw new CompileError('This comment is never closed. Add */ to end it.', p);
      advance(2);
      continue;
    }
    const start = pos();
    const startIdx = i;
    // identifiers / keywords
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      advance(j - i);
      tokens.push({ t: KEYWORDS.has(word) && word !== 'var' ? 'kw' : 'id', v: word, ...start, endLine: line, endCol: col, idx: startIdx });
      continue;
    }
    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      let ty = 'int';
      let value;
      if (c === '0' && /[xX]/.test(src[i + 1] || '')) {
        j += 2;
        while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++;
        value = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 16);
      } else if (c === '0' && /[bB]/.test(src[i + 1] || '')) {
        j += 2;
        while (j < n && /[01_]/.test(src[j])) j++;
        value = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 2);
      } else {
        while (j < n && /[0-9_]/.test(src[j])) j++;
        if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) {
          ty = 'double';
          j++;
          while (j < n && /[0-9_]/.test(src[j])) j++;
        } else if (src[j] === '.' && !/[A-Za-z_.]/.test(src[j + 1] || '')) {
          ty = 'double';
          j++;
        }
        if (/[eE]/.test(src[j] || '') && /[0-9+-]/.test(src[j + 1] || '')) {
          ty = 'double';
          j++;
          if (src[j] === '+' || src[j] === '-') j++;
          while (j < n && /[0-9]/.test(src[j])) j++;
        }
        value = Number(src.slice(i, j).replace(/_/g, ''));
      }
      const suf = src[j];
      if (suf === 'L' || suf === 'l') { ty = 'long'; j++; }
      else if (suf === 'f' || suf === 'F') { ty = 'float'; j++; }
      else if (suf === 'd' || suf === 'D') { ty = 'double'; j++; }
      if (/[A-Za-z_]/.test(src[j] || '')) {
        throw new CompileError(`'${src.slice(i, j + 1)}' is not a valid number`, start);
      }
      if (ty === 'int' && value > 2147483648) {
        throw new CompileError(`The number ${src.slice(i, j)} is too big for an int`, start, 'An int can hold up to 2147483647. Add L for a long, e.g. 3000000000L.');
      }
      advance(j - i);
      tokens.push({ t: 'num', v: value, ty, raw: src.slice(startIdx, j), ...start, endLine: line, endCol: col, idx: startIdx });
      continue;
    }
    // strings
    if (c === '"') {
      if (src.startsWith('"""', i)) throw new CompileError('Text blocks (""") are not supported here. Use a normal "string".', start);
      advance(1);
      let s = '';
      while (true) {
        if (i >= n || src[i] === '\n') {
          throw new CompileError('This string is missing its closing quote "', start, 'Strings must start and end on the same line.');
        }
        if (src[i] === '"') { advance(1); break; }
        if (src[i] === '\\') { s += readEscape(pos()); continue; }
        s += src[i];
        advance(1);
      }
      tokens.push({ t: 'str', v: s, ...start, endLine: line, endCol: col, idx: startIdx });
      continue;
    }
    // chars
    if (c === "'") {
      advance(1);
      let ch;
      if (src[i] === '\\') ch = readEscape(pos());
      else if (src[i] === "'" || src[i] === '\n' || i >= n) {
        throw new CompileError("Empty character literal. A char holds exactly one character, like 'a'.", start);
      } else { ch = src[i]; advance(1); }
      if (src[i] !== "'") {
        throw new CompileError("A char can only hold one character. Use double quotes for text: \"like this\"", start);
      }
      advance(1);
      tokens.push({ t: 'char', v: ch.charCodeAt(0), ...start, endLine: line, endCol: col, idx: startIdx });
      continue;
    }
    // operators
    let op = null;
    for (const o of OPERATORS) {
      if (src.startsWith(o, i)) { op = o; break; }
    }
    if (!op) {
      const hint = c === '“' || c === '”' ? 'That looks like a curly quote. Use a straight " instead.' : null;
      throw new CompileError(`Unexpected character '${c}'`, start, hint);
    }
    advance(op.length);
    tokens.push({ t: 'op', v: op, ...start, endLine: line, endCol: col, idx: startIdx });
  }
  tokens.push({ t: 'eof', v: '<end of file>', file, line, col, endLine: line, endCol: col, idx: n });
  return tokens;
}
