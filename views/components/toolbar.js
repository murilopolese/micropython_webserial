import { Button } from './elements/button.js'

export function Toolbar(state, emit) {
  const _canSave = state.isConnected
  const _canExecute = state.isConnected

  return html`
    <div id="toolbar">
      ${Button({
        icon: state.isConnected ? 'connect.svg' : 'disconnect.svg',
        tooltip: state.isConnected ? 'Disconnect' : 'Connect',
        onClick: () => state.isConnected ? emit('disconnect') : emit('connect'),
        active: state.isConnected
      })}

      <div class="separator"></div>

      ${Button({
        icon: 'run.svg',
        tooltip: 'Run',
        disabled: !_canExecute,
        onClick: () => emit('run')
      })}
      ${Button({
        icon: 'stop.svg',
        tooltip: 'Stop',
        disabled: !_canExecute,
        onClick: () => emit('stop')
      })}
      ${Button({
        icon: 'reboot.svg',
        tooltip: 'Reset',
        disabled: !_canExecute,
        onClick: () => emit('reset')
      })}

      <div class="separator"></div>

      ${Button({
        icon: 'save.svg',
        tooltip: 'Save',
        disabled: !_canSave,
        onClick: () => emit('save')
      })}
      ${Button({
        icon: 'files.svg',
        tooltip: 'Save',
        disabled: !_canExecute,
        onClick: () => emit('toggle-tree-panel')
      })}
    </div>
  `
}

// <div class="separator"></div>
//
// ${Button({
//   icon: 'save.svg',
//   tooltip: 'Save',
//   disabled: !_canSave,
//   onClick: () => emit('save')
// })}
// <div class="separator"></div>
// ${Button({
//   icon: 'console.svg',
//   tooltip: 'Editor and REPL',
//   active: state.view === 'editor',
//   onClick: () => emit('change-view', 'editor')
// })}
// ${Button({
//   icon: 'files.svg',
//   tooltip: 'File Manager',
//   active: state.view === 'file-manager',
//   onClick: () => emit('change-view', 'file-manager')
// })}
