// Bundled into vendor/editor.js: CodeMirror, Yjs and the WebRTC (Trystero) transport.
export { EditorView, basicSetup } from 'codemirror';
export { EditorState, Compartment } from '@codemirror/state';
export { keymap, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
export { indentWithTab } from '@codemirror/commands';
export { indentUnit } from '@codemirror/language';
export { java } from '@codemirror/lang-java';
export { setDiagnostics, lintGutter } from '@codemirror/lint';
export { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
export { tags } from '@lezer/highlight';
export * as Y from 'yjs';
export { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
export { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
export { joinRoom, selfId } from 'trystero';
