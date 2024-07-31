import { Button } from './elements/button.js'
import { XTerm } from './elements/terminal.js'

export function ReplPanel(state, emit) {
  const onToggle = () => {
    if (state.panelHeight > PANEL_CLOSED) {
      emit('close-terminal-panel')
    } else {
      emit('open-terminal-panel')
    }
  }
  const panelOpenClass = state.isPanelOpen ? 'open' : 'closed'
  const termOperationsVisibility = state.panelHeight > PANEL_TOO_SMALL ? 'visible' : 'hidden'
  const terminalDisabledClass = state.isConnected ? 'terminal-enabled' : 'terminal-disabled'

  return html`
    <div id="panel" style="height: ${state.panelHeight}px">
      <div id="panel-bar">
        <div id="drag-handle"
          onmousedown=${() => emit('start-resizing-terminal-panel')}
          onmouseup=${() => emit('finish-resizing-terminal-panel')}
          ></div>
        <div id="term-operations" class="${termOperationsVisibility}">
          ${ReplOperations(state, emit)}
        </div>
        ${Button({
          icon: `arrow-${state.panelHeight > PANEL_CLOSED ? 'down' : 'up'}.svg`,
          size: 'small',
          onClick: onToggle
        })}
      </div>
      <div class=${terminalDisabledClass}>
        ${state.cache(XTerm, 'terminal').render()}
      </div>
    </div>
  `
}

function ReplOperations(state, emit) {
  return [
    // Button({
    //   icon: 'copy.svg',
    //   size: 'small',
    //   tooltip: 'Copy',
    //   onClick: () => document.execCommand('copy')
    // }),
    // Button({
    //   icon: 'paste.svg',
    //   size: 'small',
    //   tooltip: 'Paste',
    //   onClick: () => document.execCommand('paste')
    // }),
    Button({
      icon: 'delete.svg',
      size: 'small',
      tooltip: 'Clean',
      onClick: () => emit('clear-terminal')
    })
  ]
}
