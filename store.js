import { CodeMirrorEditor } from './views/components/elements/editor.js'
import { XTerm } from './views/components/elements/terminal.js'

const log = console.log

let port
let reader
let writer

const newFileContent = ``
const HELPER_CODE = `import os
import json
os.chdir('/')
def is_directory(path):
  return True if os.stat(path)[0] == 0x4000 else False

def get_all_files(path, array_of_files = []):
  files = os.ilistdir(path)
  for file in files:
    is_folder = file[1] == 16384
    p = path + '/' + file[0]
    array_of_files.append({
        "path": p,
        "type": "folder" if is_folder else "file"
    })
    if is_folder:
        array_of_files = get_all_files(p, array_of_files)
  return array_of_files


def ilist_all(path):
  print(json.dumps(get_all_files(path)))

def delete_folder(path):
  files = get_all_files(path)
  for file in files:
    if file['type'] == 'file':
        os.remove(file['path'])
  for file in reversed(files):
    if file['type'] == 'folder':
        os.rmdir(file['path'])
  os.rmdir(path)
`

function sleep(millis) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, millis)
  })
}

export async function store(state, emitter) {
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
  state.resolveReadingUntilPromise = () => Promise.resolve()
  state.rejectReadingUntilPromise = () => Promise.reject()

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

  const newFile = createEmptyFile()
  newFile.editor.onChange = function() {
    state.editingFile.hasChanges = true
    emitter.emit('render')
  }
  state.editingFile = newFile
  state.openedFolders = []
  state.selectedItem = null // path of selected item (file or folder)

  function createFile(args) {
    const {
      path,
      content = newFileContent,
      hasChanges = false
    } = args
    const id = generateHash()
    const editor = state.cache(CodeMirrorEditor, `editor_${id}`)
    editor.content = content
    return {
      id,
      path,
      editor,
      hasChanges
    }
  }
  function createEmptyFile() {
    return createFile({
      path: '/' + generateFileName(),
      hasChanges: false
    })
  }

  async function readForeverAndReport(cb) {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          // Allow the serial port to be closed later.
          reader.releaseLock();
          break;
        }
        if (value) {
          cb(value);
        }
      }
    } catch (error) {
      // TODO: Handle non-fatal read error.
    }
  }
  async function connect() {
    return new Promise((resolve, reject) => {
      navigator.serial.requestPort()
        .then(async (port) => {
          await port.open({ baudRate: 115200 })
          reader = port.readable.getReader()
          writer = port.writable.getWriter()
          resolve(port)
        })
      . catch(reject)
    })
  }
  async function disconnect() {
    try {
      writer.releaseLock()
      reader.releaseLock()
      await port.close()
    } catch(e) {
      console.log(`Can't disconnect`, e)
    }
    return Promise.resolve()
  }
  async function write(str) {
    const textEncoder = new TextEncoder()
    const uint8Array = textEncoder.encode(str)
    await writer.write(uint8Array)
  }
  async function readUntil(token) {
    if (state.readingUntil) {
      // Already reading until
      return Promise.reject(new Error('Already running "read until"'))
    }
    // Those variables are going to be referenced on emitter.on('data')
    state.readingUntil = token
    state.readingBuffer = ''
    return new Promise((resolve, reject) => {
      // Those functions are going to be called on emitter.on('data')
      state.resolveReadingUntilPromise = (result) => {
        state.readingUntil = null
        state.readingBuffer = ''
        state.resolveReadingUntilPromise = () => false
        state.rejectReadingUntilPromise = () => false
        resolve(result)
      }
      state.rejectReadingUntilPromise = (msg) => {
        state.readingUntil = null
        state.readingBuffer = ''
        state.resolveReadingUntilPromise = () => false
        state.rejectReadingUntilPromise = () => false
        reject(new Error(msg))
      }
    })
  }

  // also known as stop
  async function getPrompt() {
    state.rejectReadingUntilPromise('Interrupt execution to get prompt')
    write('\x03\x02')
    await readUntil('>>>')
  }
  async function reset() {
    state.readingUntil = '>>>'
    state.readingBuffer = ''
    const promise = new Promise((resolve, reject) => {
      state.resolveReadingUntilPromise = resolve
    })
    write('\x04')
    await promise
    state.readingUntil = null
    state.readingBuffer = ''
    state.resolveReadingUntilPromise = null
  }
  async function enterRawRepl() {
    write('\x01')
    await readUntil('raw REPL; CTRL-B to exit')
  }
  async function exitRawRepl() {
    write('\x02')
    await readUntil('>>>')
  }
  async function executeRaw(code) {
    const S = 128
    for (let i = 0; i < code.length; i += S) {
      const c = code.slice(i, i+S)
      await write(c)
      await sleep(10)
    }
    await write('\x04')
    return await readUntil('\x04>')
  }

  async function runHelper() {
    await getPrompt()
    await enterRawRepl()
    const out = await executeRaw(HELPER_CODE)
    await exitRawRepl()
    return out
  }

  async function getBoardFiles(path) {
    await runHelper()
    await enterRawRepl()
    let out = await executeRaw(`print(json.dumps(get_all_files("")))`)
    await exitRawRepl()

    let files = JSON.parse(out.split('OK')[1].split('\x04')[0])

    // Hold you hat, nested reduce ahead
    // TODO: Optimize this step
    let tree = files.reduce((r, file) => {
      file.path.split('/')
      .filter(a => a)
      .reduce((childNodes, title) => {
        let child = childNodes.find(n => n.title === title)
        if (!child) {
          child = {
            title: title,
            type: file.type,
            path: file.path,
            childNodes: []
          }
          childNodes.push(child)
        }
        // Sort by type, alphabetically
        childNodes = childNodes.sort((a, b) => {
          return b.type.localeCompare(a.type) || a.title.localeCompare(b.title)
        })
        return child.childNodes
      }, r)
      return r
    }, [])
    // Sort by type, alphabetically
    tree = tree.sort((a, b) => {
      return b.type.localeCompare(a.type) || a.title.localeCompare(b.title)
    })
    return tree
  }
  async function loadFile(path) {
    await getPrompt()
    await enterRawRepl()
    let output = await executeRaw(
      `with open('${path}','r') as f:\n while 1:\n  b=f.read(256)\n  if not b:break\n  print(b,end='')`
    )
    await exitRawRepl()
    return output.split('OK')[1].split('\x04')[0]
  }
  async function saveFile(path, content) {
    await getPrompt()
    await enterRawRepl()
    await executeRaw(`f=open('${path}','wb')\nw=f.write`)
    for (let i = 0; i < content.length; i += 128) {
      const c = content.slice(i, i+128)
      const d = new TextEncoder().encode(c)
      await executeRaw(`w(bytes([${d}]))`)
    }
    await executeRaw(`f.close()`)
    await exitRawRepl()
  }
  async function removeFile(path) {
    await getPrompt()
    await enterRawRepl()
    let command = `import uos\n`
        command += `try:\n`
        command += `  uos.remove("${path}")\n`
        command += `except OSError:\n`
        command += `  print(0)\n`
    await executeRaw(command)
    await exitRawRepl()
  }
  async function createBoardFile(path) {
    await getPrompt()
    await enterRawRepl()
    let command = `f=open('${path}', 'w');f.close()`
    await executeRaw(command)
    await exitRawRepl()
  }
  async function createBoardFolder(path) {
    await getPrompt()
    await enterRawRepl()
    let command = `import os;os.mkdir('${path}')`
    await executeRaw(command)
    await exitRawRepl()
  }
  async function renameItem(srcPath, destPath) {
    await getPrompt()
    await enterRawRepl()
    let command = `import os;os.rename('${srcPath}','${destPath}')`
    await executeRaw(command)
    await exitRawRepl()
  }


  // CONNECTION
  emitter.on('connect', async() => {
    log('connect')
    emitter.emit('disconnect')
    state.isConnecting = true
    emitter.emit('render')

    try {
      port = await connect()
      state.port = port
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
    log('run')
    await getPrompt()
    const code = state.editingFile.editor.editor.state.doc.toString()
    emitter.emit('open-terminal-panel')
    emitter.emit('render')
    try {
      await enterRawRepl()
      for (let i = 0; i < code.length; i += 128) {
        const c = code.slice(i, i+128)
        await write(c)
        await sleep(10)
      }
      await write('\x04')
      await readUntil('\x04>')
      await exitRawRepl()
    } catch(e) {
      log('error', e)
    }
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
  emitter.on('data', (buff) => {
    const decoder = new TextDecoder()
    const data = decoder.decode(buff)
    if (state.readingUntil) {
      state.readingBuffer += data
      if (state.readingBuffer.indexOf(state.readingUntil) != -1) {
        let response = state.readingBuffer
        state.readingUntil = null
        state.readingBuffer = ''
        state.resolveReadingUntilPromise(response)
      }
    }
    // log('data', data)
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
    log('save')
    state.isSaving = true
    emitter.emit('render')
    const code = state.editingFile.editor.editor.state.doc.toString()
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

    await getPrompt()
    if (selectedItem.type == 'file') {
      await removeFile(selectedItem.path)
      state.editingFile = createEmptyFile()
      state.selectedItem = null
    } else {
      await runHelper()
      await enterRawRepl()
      await executeRaw(`delete_folder('${selectedItem.path}')`)
      await exitRawRepl()
      const i = state.openedFolders.indexOf(selectedItem.path)
      state.openedFolders.splice(i, 1)
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

  emitter.on('upload-file', async (e) => {
    log('upload-files', e)
    let file = null
    if (e.dataTransfer.items) {
      const items = e.dataTransfer.items
      if (items.length > 0) {
        const item = items[0]
        file = item.getAsFile()

      }
    } else {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        file = e.dataTransfer.files[0]
      }
    }
    if (file == null) return
    if (file.type != 'text/x-python') return
    state.isUploading = true
    emitter.emit('render')
    const reader = new FileReader()
    reader.addEventListener('load', async () => {
      let content = reader.result
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
      let newFile = createFile({
        path: parentFolder + '/' + file.name,
        content: content
      })
      await saveFile(newFile.path, newFile.editor.content)
      state.editingFile = newFile
      state.selectedItem = newFile.path
      state.isUploading = false
      emitter.emit('refresh-files')
      emitter.emit('render')
    })
    reader.readAsText(file)
  })

}

function generateHash() {
  return `${Date.now()}_${parseInt(Math.random()*1024)}`
}

function generateFileName(filename) {
  if (filename) {
    let name = filename.split('.py')
    return `${name[0]}_${Date.now()}.py`
  } else {
    return `${pickRandom(adjectives)}_${pickRandom(nouns)}.py`
  }
}

function pickRandom(array) {
  return array[parseInt(Math.random()*array.length)]
}
