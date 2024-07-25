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
    let selectedClass = file.path == state.editingFile.path ? 'selected' : ''
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
  return html`
    <div id="tree-panel" class="column ${state.isTreePanelOpen ? 'open' : ''}">
      <div id="tree-header">Nano ESP32 (/dev/ttyACM0)</div>
      <div id="tree-items">
        ${state.boardFiles.map(Item)}
      </div>
      <div id="tree-options">
        ${Button({
          icon: `new-file.svg`,
          size: 'small'
        })}
        ${Button({
          icon: `new-folder.svg`,
          size: 'small'
        })}
        ${Button({
          icon: `delete.svg`,
          size: 'small'
        })}
        ${Button({
          icon: `cursor.svg`,
          size: 'small'
        })}
        ${Button({
          icon: `arrow-up.svg`,
          size: 'small'
        })}
        ${Button({
          icon: `arrow-down.svg`,
          size: 'small'
        })}
      </div>
    </div>
  `
}
