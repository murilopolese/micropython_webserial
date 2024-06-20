export function CodeEditor(state, emit) {
  if (state.editingFile) {
    return state.editingFile.editor.render()
  } else {
    return html`
      <div id="code-editor"></div>
    `
  }
}
