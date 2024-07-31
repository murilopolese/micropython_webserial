import { Toolbar } from './components/toolbar.js'
import { CodeEditor } from './components/code-editor.js'
import { ReplPanel } from './components/repl-panel.js'
import { TreePanel } from './components/tree-panel.js'

export function EditorView(state, emit) {
  function onDrop(e) {
    e.preventDefault()
    emit('upload-file', e)
  }
  function onDragOver(e) {
    e.preventDefault()
  }
  // TODO: solve this with css
  const w = state.isTreePanelOpen ? 'width: calc(100% - 300px)' : ''
  return html`
    <div id="working-area" ondrop=${onDrop} ondragover=${onDragOver}>
      ${Toolbar(state, emit)}
      <div class="row">
        ${TreePanel(state, emit)}
        <div class="column" style="border-left: solid 2px #DCE1E1; ${w}">
          <div id="file-header">${state.editingFile.path} ${state.editingFile.hasChanges ? '*' : ''}</div>
          ${CodeEditor(state, emit)}
          ${ReplPanel(state, emit)}
        </div>
      </div>
    </div>
  `
}
