// Aliases
const log = console.log

// Component classes
import { XTerm } from './views/components/elements/terminal.js'

import { micropythonWebserial } from './micropython-webserial.js'
import { fileCreator, base64ToUint8Array } from './util.js'

export async function store(state, emitter) {
  const {
    readForeverAndReport,
    connect,
    disconnect,
    write,
    readUntil,
    getPrompt,
    reset,
    enterRawRepl,
    exitRawRepl,
    executeRaw,
    runHelper,
    getBoardFiles,
    loadFile,
    saveFile,
    removeFile,
    createBoardFile,
    createBoardFolder,
    renameItem,
    run,
    removeFolder,
    uploadFile,
    downloadFile
  } = await micropythonWebserial(state, emitter)

  const {
    createFile,
    createEmptyFile
  } = fileCreator(state.cache)

  // CONNECTION
  emitter.on('connect', async() => {
    log('connect')
    emitter.emit('disconnect')
    state.isConnecting = true
    emitter.emit('render')

    try {
      state.port = await connect()
      state.isConnected = true

      // Toggle panel accordingly
      if (state.panelHeight <= PANEL_CLOSED) {
        state.panelHeight = state.savedPanelHeight
      }
      // Prompt board to print it's init message
      write('\x02')
      // Bind terminal
      let term = state.cache(XTerm, 'terminal').term
      if (!state.isTerminalBound) {
        state.isTerminalBound = true
        term.onData(async (data) => {
          await write(data)
          term.scrollToBottom()
        })
      }
      // Report data from the serial to the terminal and "data" event
      readForeverAndReport((data) => {
        term.write(data)
        emitter.emit('data', data)

      })
      navigator.serial.addEventListener("disconnect", (event) => {
        emitter.emit('disconnect')
      });
    } catch(err) {
      log('error', err)
      state.isConnected = false
    }

    state.isConnecting = false
    emitter.emit('render')

    // Delay the rendering a little bit
    setTimeout(() => {
      if (state.isConnected) {
        state.isTreePanelOpen = true
        emitter.emit('refresh-files')
        emitter.emit('open-terminal-panel')
      }
    }, 100)
  })
  emitter.on('disconnect', async () => {
    await disconnect()
    state.isConnected = false
    state.panelHeight = PANEL_CLOSED
    state.boardFiles = []
    state.boardNavigationPath = '/'
    state.isTreePanelOpen = false
    // emitter.emit('refresh-files')
    emitter.emit('render')
  })

  // CODE EXECUTION
  emitter.on('run', async () => {
    const code = state.editingFile.editor.editor.state.doc.toString()
    log('run', code)
    emitter.emit('open-terminal-panel')
    await run(code)
  })
  emitter.on('stop', async () => {
    log('stop')
    emitter.emit('open-terminal-panel')
    emitter.emit('render')
    await getPrompt()
    log('stopped')
  })
  emitter.on('reset', async () => {
    log('reset')
    emitter.emit('open-terminal-panel')
    await getPrompt()
    await reset()
    emitter.emit('open-terminal-panel')
    emitter.emit('render')
    log('reseted')
  })

  // HANDLING DATA FROM SERIAL
  emitter.on('data', async (buff) => {
    if (state.readingUntil != null) {
      state.readingBuffer += (new TextDecoder()).decode(buff)
      if (state.readingBuffer.indexOf(state.readingUntil) != -1) {
        const response = state.readingBuffer
        state.readingUntil = null
        state.readingBuffer = null
        state.resolveReadingUntilPromise(response)
      }
    }
  })

  // PANEL
  emitter.on('open-terminal-panel', () => {
    emitter.emit('finish-resizing-terminal-panel')
    state.panelHeight = state.savedPanelHeight
    emitter.emit('render')
    setTimeout(() => {
      state.cache(XTerm, 'terminal').resizeTerm()
    }, 200)
  })
  emitter.on('close-terminal-panel', () => {
    emitter.emit('finish-resizing-terminal-panel')
    state.savedPanelHeight = state.panelHeight
    state.panelHeight = 0
    emitter.emit('render')
  })
  emitter.on('clear-terminal', () => {
    state.cache(XTerm, 'terminal').term.clear()
  })
  emitter.on('start-resizing-terminal-panel', () => {
    log('start-resizing-terminal-panel')
    window.addEventListener('mousemove', state.resizePanel)
    // Stop resizing when mouse leaves window or enters the tabs area
    document.body.addEventListener('mouseleave', () => {
      emitter.emit('finish-resizing-terminal-panel')
    }, { once: true })
  })
  emitter.on('finish-resizing-terminal-panel', () => {
    log('finish-resizing-terminal-panel')
    window.removeEventListener('mousemove', state.resizePanel)
  })

  // TREE VIEW
  emitter.on('refresh-files', async () => {
    log('refresh-files')
    if (state.isLoadingFiles) return
    state.isLoadingFiles = true
    emitter.emit('render')

    if (state.isConnected) {
      state.boardFiles = await getBoardFiles('')
    } else {
      state.boardFiles = []
    }

    state.boardFilesMap = {}
    function recurse(files) {
      for (let i = 0; i < files.length; i++) {
        let f = files[i]
        state.boardFilesMap[f.path] = f
        if (f.type == 'folder') recurse(f.childNodes)
      }

    }
    recurse(state.boardFiles)

    state.isLoadingFiles = false
    emitter.emit('render')
  })
  emitter.on('toggle-tree-panel', () => {
    state.isTreePanelOpen = !state.isTreePanelOpen
    emitter.emit('refresh-files')
    emitter.emit('render')
  })
  emitter.on('toggle-folder', (path) => {
    const index = state.openedFolders.indexOf(path)
    if (index == -1) {
      state.openedFolders.push(path)
    } else {
      state.openedFolders.splice(index, 1)
    }
    state.selectedItem = path
    emitter.emit('render')
  })

  // FILE MANAGEMENT
  emitter.on('load-file', async (path) => {
    log('load-file', path)

    if (state.editingFile.hasChanges) {
      const response = confirm('Your file has unsaved changes. Are you sure you want to proceed?')
      if (!response) return false
    }
    const out = await loadFile(path)
    state.editingFile = createFile({
      path: path,
      content: out
    })
    state.editingFile.editor.onChange = function() {
      state.editingFile.hasChanges = true
      emitter.emit('render')
    }
    state.selectedItem = state.editingFile.path
    emitter.emit('render')
  })
  emitter.on('save', async () => {
    const code = state.editingFile.editor.editor.state.doc.toString()
    log('save', code)
    state.isSaving = true
    emitter.emit('render')
    await saveFile(state.editingFile.path, code)
    state.isSaving = false
    state.selectedItem = state.editingFile.path
    state.editingFile.hasChanges = false
    emitter.emit('refresh-files')
    emitter.emit('render')
  })
  emitter.on('remove', async () => {
    const response = confirm('You are about to delete this item. Are you sure you want to proceed?')
    if (!response) return false

    state.isRemoving = true
    emitter.emit('render')

    let selectedItem = state.boardFilesMap[state.selectedItem]

    if (selectedItem.type == 'file') {
      await removeFile(selectedItem.path)
      state.editingFile = createEmptyFile()
      state.selectedItem = null
    } else if (selectedItem.type == 'folder') {
      await removeFolder(selectedItem.path)
      // Remove the folder from opened folders
      const i = state.openedFolders.indexOf(selectedItem.path)
      state.openedFolders.splice(i, 1)
      // Create new file if editing file was inside the deleted folder
      if (state.editingFile.path.indexOf(selectedItem.path) == 0) {
        state.editingFile = createEmptyFile()
        state.selectedItem = null
      }
    }
    state.isRemoving = false
    emitter.emit('refresh-files')
    emitter.emit('render')
  })

  emitter.on('start-creating-file', () => {
    log('start-creating-file')
    state.isCreatingFile = true
    if (state.selectedItem == null) {
      state.creatingItemAt = '/'
    }
    if (state.selectedItem == state.editingFile.path) {
      state.creatingItemAt = state.selectedItem.split('/').slice(0, -1).join('/') + '/'
    } else if (state.selectedItem) {
      state.creatingItemAt = state.selectedItem + '/'
    }
    emitter.emit('render')
  })
  emitter.on('finish-creating-file', async (value) => {
    log('finish-creating-file', value)
    if (value != null) {
      await createBoardFile(value)
      state.editingFile = createFile({ path: value })
      state.selectedItem = value
    }
    state.isCreatingFile = false
    emitter.emit('refresh-files')
    emitter.emit('render')
  })

  emitter.on('start-creating-folder', () => {
    log('start-creating-folder')
    state.isCreatingFolder = true
    if (state.selectedItem == null) {
      state.creatingItemAt = '/'
    }
    if (state.selectedItem == state.editingFile.path) {
      state.creatingItemAt = state.selectedItem.split('/').slice(0, -1).join('/') + '/'
    } else if (state.selectedItem) {
      state.creatingItemAt = state.selectedItem + '/'
    }
    emitter.emit('render')
  })
  emitter.on('finish-creating-folder', async (value) => {
    log('finish-creating-folder', value)
    if (value != null) {
      await createBoardFolder(value)
      state.selectedItem = value
    }
    state.isCreatingFolder = false
    emitter.emit('refresh-files')
    emitter.emit('render')
  })

  emitter.on('start-renaming-item', () => {
    log('start-renaming-item')
    state.isRenamingItem = true
    emitter.emit('render')
  })
  emitter.on('finish-renaming-item', async (value) => {
    log('finish-renaming-item', value)
    await renameItem(state.selectedItem, value)
    state.selectedItem = value
    state.isRenamingItem = false
    emitter.emit('refresh-files')
    emitter.emit('render')
  })

  emitter.on('upload-file', async () => {
    log('upload-file')
    const [fileHandle] = await window.showOpenFilePicker()
    if (fileHandle) {
      const file = await fileHandle.getFile()
      state.isUploading = true
      emitter.emit('render')
      const reader = new FileReader()
      reader.addEventListener('load', async () => {
        // Figuring out who will be the parent of this new file
        let parentFolder = ''
        if (state.selectedItem != null) {
          const treeItem = state.boardFilesMap[state.selectedItem]
          if (treeItem == undefined) {
            // Defaults to ''
          } else if (treeItem.type == 'folder') {
            parentFolder = state.selectedItem
          } else if (treeItem.type == 'file') {
            parentFolder = state.selectedItem.split('/').slice(0, -1).join('/')
          }
        }
        // Creating file
        const decoder = new TextDecoder()
        let content = decoder.decode(reader.result)
        let newFile = createFile({
          path: parentFolder + '/' + file.name,
          content: content
        })
        // Transfer file to the board
        await uploadFile(newFile.path, reader.result)
        // Load the new file as the currently selected file
        state.editingFile = newFile
        state.selectedItem = newFile.path
        state.isUploading = false
        emitter.emit('refresh-files')
        emitter.emit('render')
      })
      reader.readAsArrayBuffer(file)
    }
  })
  emitter.on('download-file', async () => {
    log('download-file', state.selectedItem)
    state.isDownloading = true
    emitter.emit('render')
    const fileContent = await downloadFile(state.selectedItem)
    const buffer = base64ToUint8Array(fileContent)
    const blob = new Blob([buffer])
    saveAs(blob, state.boardFilesMap[state.selectedItem].title);
    state.isDownloading = false
    emitter.emit('render')
  })

}
