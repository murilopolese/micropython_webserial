import { Toolbar } from './components/toolbar.js'
import { CodeEditor } from './components/code-editor.js'
import { ReplPanel } from './components/repl-panel.js'

export function EditorView(state, emit) {
  return html`
    <div class="working-area">
      ${Toolbar(state, emit)}
      ${CodeEditor(state, emit)}
      ${ReplPanel(state, emit)}
    </div>
  `
}
