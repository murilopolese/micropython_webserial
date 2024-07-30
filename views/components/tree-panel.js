import { Button } from './elements/button.js'

export function TreePanel(state, emit) {
  function Item(file) {
    function openFile() {
      if (file.type == 'file') {
        emit('load-file', file.path)
      } else if (file.type == 'folder') {
        emit('toggle-folder', file.path)
      }
    }
    let icon = file.type == 'file' ? 'file' : 'folder'
    let selectedClass = file.path == state.selectedItem ? 'selected' : ''
    let opened = state.openedFolders.indexOf(file.path) != -1

    if (file.childNodes.length) {
      return html`
        <details class="item-wrapper" open=${opened}>
          <summary class="root">
            <div class="item ${selectedClass}" onclick=${openFile}>
              <img class="icon" src="media/${icon}.svg" />
              <div class="text">${file.title}</div>
            </div>
          </summary>
          <div class="children">
            ${file.childNodes.map(Item)}
          </div>
        </details>
      `
    } else {
      return html`
      <div class="item-wrapper">
        <div class="root">
          <div class="item  ${selectedClass}" onclick=${openFile}>
            <img class="icon" src="media/${icon}.svg" />
            <div class="text">${file.title}</div>
          </div>
        </div>
      </div>
      `
    }
  }
  let options = [
    Button({
      icon: `new-file.svg`,
      size: 'small',
      disabled: !state.isConnected,
      onClick: () => emit('start-creating-file')
    }),
    Button({
      icon: `new-folder.svg`,
      size: 'small',
      onClick: () => emit('start-creating-folder')
    }),
    Button({
      icon: `delete.svg`,
      size: 'small',
      disabled: state.selectedItem == null,
      onClick: () => emit('remove')
    }),
    Button({
      icon: `cursor.svg`,
      size: 'small',
      disabled: true
    })
  ]

  if (state.isCreatingFile) {
    options = html`
      <input type="text" value=${state.creatingItemAt} />
      ${Button({
        icon: `save.svg`,
        size: 'small',
        onClick: () => emit('finish-creating-file', document.querySelector('#tree-options input').value)
      })}
      ${Button({
        icon: `close.svg`,
        size: 'small',
        onClick: () => emit('finish-creating-file', null)
      })}
    `
  }
  if (state.isCreatingFolder) {
    options = html`
      <input type="text" value=${state.creatingItemAt} />
      ${Button({
        icon: `save.svg`,
        size: 'small',
        onClick: () => emit('finish-creating-folder', document.querySelector('#tree-options input').value)
      })}
      ${Button({
        icon: `close.svg`,
        size: 'small',
        onClick: () => emit('finish-creating-folder', null)
      })}
    `
  }

  return html`
    <div id="tree-panel" class="column ${state.isTreePanelOpen ? 'open' : ''}">
      <div id="tree-items">
        ${state.boardFiles.map(Item)}
      </div>
      <div id="tree-options">
        ${options}
      </div>
    </div>
  `
}
