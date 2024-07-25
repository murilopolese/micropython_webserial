import { Toolbar } from './components/toolbar.js'
import { CodeEditor } from './components/code-editor.js'
import { ReplPanel } from './components/repl-panel.js'
import { TreePanel } from './components/tree-panel.js'

export function EditorView(state, emit) {
  return html`
    <div id="working-area">
      ${Toolbar(state, emit)}
      <div class="row">
        ${TreePanel(state, emit)}
        <div class="column" style="border-left: solid 2px #DCE1E1;">
          ${CodeEditor(state, emit)}
          ${ReplPanel(state, emit)}
        </div>
      </div>
    </div>
  `
}
