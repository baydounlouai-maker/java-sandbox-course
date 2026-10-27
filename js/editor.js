// The code editor: CodeMirror 6 bound to a shared Y.Text.
import {
  EditorView, basicSetup, EditorState, keymap, indentWithTab, indentUnit, java, setDiagnostics, lintGutter,
  HighlightStyle, syntaxHighlighting, tags, yCollab, yUndoManagerKeymap, Y
} from '../vendor/editor.js';

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px', backgroundColor: '#ffffff', color: '#1f2a44' },
  '.cm-scroller': { fontFamily: "'Fira Code', ui-monospace, monospace", lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0', caretColor: '#ff7a29' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ff7a29', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: '#ffffff', color: '#6b7593', border: 'none', paddingLeft: '6px' },
  '.cm-activeLine': { backgroundColor: '#fff7ef' },
  '.cm-activeLineGutter': { backgroundColor: '#fff7ef', color: '#1f2a44' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#d6e6ff !important' },
  '.cm-matchingBracket': { backgroundColor: '#e3f0ff', outline: '1px solid #9fc0ff' },
  '.cm-tooltip': { border: '2px solid #1f2a44', borderRadius: '10px', overflow: 'hidden', fontFamily: "'Nunito', sans-serif" },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#e3f0ff', color: '#1f2a44' },
  '.cm-diagnostic-error': { borderLeft: '4px solid #e0342b', fontFamily: "'Nunito', sans-serif", fontSize: '14px' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #e0342b', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #d48a00', textUnderlineOffset: '3px' },
  '.cm-ySelectionInfo': { fontFamily: "'Nunito', sans-serif", fontWeight: '800', fontSize: '11px', padding: '1px 6px', borderRadius: '999px', opacity: '1', top: '-1.3em' },
  '.cm-panels': { backgroundColor: '#f6f8fd' }
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.definitionKeyword, tags.operatorKeyword], color: '#7b3fe4', fontWeight: '500' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#0a7a8a' },
  { tag: [tags.string, tags.character, tags.special(tags.string)], color: '#17803a' },
  { tag: [tags.number, tags.bool, tags.null], color: '#c2410c' },
  { tag: [tags.lineComment, tags.blockComment, tags.comment], color: '#6b7280', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#2f5bd6' },
  { tag: [tags.annotation, tags.meta], color: '#b4308a' },
  { tag: [tags.definition(tags.variableName)], color: '#1f2a44', fontWeight: '600' }
]);

export class CodeEditor {
  constructor(parent, { onRun }) {
    this.parent = parent;
    this.onRun = onRun;
    this.view = null;
    this.ytext = null;
    // line heights change once the web font arrives; re-measure so the gutter lines up
    if (document.fonts) document.fonts.ready.then(() => this.view && this.view.requestMeasure());
    new ResizeObserver(() => this.view && this.view.requestMeasure()).observe(parent);
  }

  bind(ytext, awareness, { readOnly = false } = {}) {
    if (this.view && this.ytext === ytext && this.readOnly === readOnly) return;
    this.destroy();
    this.ytext = ytext;
    this.readOnly = readOnly;
    const undoManager = new Y.UndoManager(ytext);
    this.view = new EditorView({
      parent: this.parent,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          keymap.of([
            { key: 'Mod-Enter', run: () => { this.onRun(); return true; } },
            { key: 'Shift-Enter', run: () => { this.onRun(); return true; } },
            ...yUndoManagerKeymap,
            indentWithTab
          ]),
          basicSetup,
          java(),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          theme,
          syntaxHighlighting(highlight),
          lintGutter(),
          yCollab(ytext, awareness, { undoManager }),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': 'Java code editor', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' })
        ]
      })
    });
  }

  destroy() {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    this.ytext = null;
  }

  // diagnostics: [{line, col, message, severity}]
  showDiagnostics(list) {
    if (!this.view) return;
    const doc = this.view.state.doc;
    const diags = [];
    for (const d of list) {
      if (!d.line || d.line > doc.lines) continue;
      const line = doc.line(d.line);
      let from = Math.min(line.from + Math.max(0, (d.col || 1) - 1), line.to);
      const rest = doc.sliceString(from, line.to);
      const m = /^(\w+|\S)/.exec(rest);
      let to = from + (m ? m[0].length : 0);
      if (to === from) {
        // error at end of line (like a missing ;): mark the last character
        from = Math.max(line.from, from - 1);
        to = Math.min(line.to, from + 1);
      }
      diags.push({ from, to, severity: d.severity || 'error', message: d.message + (d.hint ? '\n' + d.hint : '') });
    }
    this.view.dispatch(setDiagnostics(this.view.state, diags));
  }

  goto(line, col = 1) {
    if (!this.view) return;
    const doc = this.view.state.doc;
    const l = doc.line(Math.min(Math.max(1, line), doc.lines));
    const pos = Math.min(l.from + col - 1, l.to);
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    this.view.focus();
  }

  focus() { if (this.view) this.view.focus(); }
}
