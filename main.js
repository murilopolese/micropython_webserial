import { EditorView } from './views/editor.js'
import { Overlay } from './views/components/overlay.js'
import { store } from './store.js'
import { model } from './model.js'


function App(state, emit) {
  return html`
    <div id="app">
      ${EditorView(state, emit)}
      ${Overlay(state, emit)}
    </div>
  `
}

let app = Choo()
app.use(model)
app.use(store);
app.route('*', App)
app.mount('#app')
