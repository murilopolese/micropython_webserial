import { fileCreator } from './util.js'

export async function model(state, emitter) {
  state.editingFile = null
  state.isConnecting = false
  state.isConnected = false
  state.isTerminalBound = false
  state.boardFiles = []
  state.isLoadingFiles = false
  state.isSaving = false
  state.isRemoving = false
  state.isCreatingFile = false
  state.isCreatingFolder = false

  state.readingBuffer = ''
  state.readingUntil = null
  state.resolveReadingUntilPromise = () => false
  state.rejectReadingUntilPromise = () => false

  state.savedPanelHeight = PANEL_DEFAULT
  state.panelHeight = PANEL_CLOSED
  state.resizePanel = function(e) {
    state.panelHeight = (PANEL_CLOSED/2) + document.body.clientHeight - e.clientY
    if (state.panelHeight <= PANEL_CLOSED) {
      state.savedPanelHeight = PANEL_DEFAULT
    } else {
      state.savedPanelHeight = state.panelHeight
    }
    emitter.emit('render')
  }

  const { createEmptyFile } = fileCreator(state.cache)
  const newFile = createEmptyFile()
  newFile.editor.onChange = function() {
    state.editingFile.hasChanges = true
    emitter.emit('render')
  }
  state.editingFile = newFile
  state.openedFolders = []
  state.selectedItem = null // path of selected item (file or folder)

}
