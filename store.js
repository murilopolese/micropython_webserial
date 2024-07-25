import { CodeMirrorEditor } from './views/components/elements/editor.js'
import { XTerm } from './views/components/elements/terminal.js'

const log = console.log

let port
let reader
let writer

const newFileContent = ``

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

  const newFile = createEmptyFile({
    parentFolder: null, // Null parent folder means not saved?
    source: 'disk'
  })
  newFile.editor.onChange = function() {
    newFile.hasChanges = true
    emitter.emit('render')
  }
  state.editingFile = newFile
  state.openedFolders = []

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
      .catch(reject)
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
  // also known as stop
  async function getPrompt() {
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
    for (let i = 0; i < code.length; i += 128) {
      const c = code.slice(i, i+128)
      await write(c)
      await sleep(10)
    }
    await write('\x04')
    return await readUntil('\x04>')
  }

  async function readUntil(token) {
    if (state.readingUntil) {
      // Already reading until
      console.log('already running read until')
      return Promise.reject()
    }
    // Those variables are going to be referenced on emitter.on('data')
    state.readingUntil = token
    state.readingBuffer = ''
    return new Promise((resolve, reject) => {
      // Those functions are going to be called on emitter.on('data')
      state.resolveReadingUntilPromise = (result) => {
        state.readingUntil = null
        state.readingBuffer = ''
        resolve(result)
      }
    })
  }

  async function getBoardFiles(path) {
    await runHelper()

    // await getPrompt()
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
  async function runHelper() {
    const code = `import os
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
    await getPrompt()
    await enterRawRepl()
    const out = await executeRaw(code)
    await exitRawRepl()
    return out
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

  function createEmptyFile({ source, parentFolder }) {
    return createFile({
      fileName: generateFileName(),
      hasChanges: true
    })
  }

  // START AND BASIC ROUTING
  emitter.on('connect', async() => {
    log('connect')
    emitter.emit('disconnect')
    state.isConnecting = true
    emitter.emit('render')

    try {
      port = await connect()
      state.isConnected = true

      if (state.panelHeight <= PANEL_CLOSED) {
        state.panelHeight = state.savedPanelHeight
      }

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
      async function report(a) {
        term.write(a)
        emitter.emit('data', a)
      }
      readForeverAndReport(report)
      navigator.serial.addEventListener("disconnect", (event) => {
        emitter.emit('disconnect')
      });
    } catch(err) {
      log('error', err)
      state.isConnected = false
    }

    state.isConnecting = false
    emitter.emit('render')
    setTimeout(() => {
      if (state.isConnected) {
        state.isTreePanelOpen = true
        emitter.emit('refresh-files')
        emitter.emit('open-panel')
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
    emitter.emit('open-panel')
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
    emitter.emit('open-panel')
    emitter.emit('render')
    await getPrompt()
    log('stopped')
  })
  emitter.on('reset', async () => {
    log('reset')
    emitter.emit('open-panel')
    await getPrompt()
    await reset()
    emitter.emit('open-panel')
    emitter.emit('render')
    log('reseted')
  })

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
  emitter.on('open-panel', () => {
    emitter.emit('stop-resizing-panel')
    state.panelHeight = state.savedPanelHeight
    emitter.emit('render')
    setTimeout(() => {
      state.cache(XTerm, 'terminal').resizeTerm()
    }, 200)
  })
  emitter.on('close-panel', () => {
    emitter.emit('stop-resizing-panel')
    state.savedPanelHeight = state.panelHeight
    state.panelHeight = 0
    emitter.emit('render')
  })
  emitter.on('clear-terminal', () => {
    state.cache(XTerm, 'terminal').term.clear()
  })
  emitter.on('start-resizing-panel', () => {
    log('start-resizing-panel')
    window.addEventListener('mousemove', state.resizePanel)
    // Stop resizing when mouse leaves window or enters the tabs area
    document.body.addEventListener('mouseleave', () => {
      emitter.emit('stop-resizing-panel')
    }, { once: true })
  })
  emitter.on('stop-resizing-panel', () => {
    log('stop-resizing-panel')
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
    emitter.emit('render')
  })

  // FILE MANAGEMENT
  emitter.on('load-file', async (path) => {
    log('load-file', path)
    const out = await loadFile(path)
    const editorState = state.editingFile.editor.editor.state
    const update = editorState.update({
      changes: {
        from: 0,
        to: editorState.doc.length,
        insert: out
      }
    })
    state.editingFile.editor.editor.update([update])
    state.editingFile.path = path
    emitter.emit('render')
  })
  emitter.on('save', async () => {
    log('save')
    state.isSaving = true
    emitter.emit('render')
    const code = state.editingFile.editor.editor.state.doc.toString()
    await saveFile(state.editingFile.path, code)
    state.isSaving = false
    emitter.emit('render')
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
