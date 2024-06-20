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

  const newFile = createEmptyFile({
    parentFolder: null, // Null parent folder means not saved?
    source: 'disk'
  })
  newFile.editor.onChange = function() {
    newFile.hasChanges = true
    emitter.emit('render')
  }
  let l = location.hash.slice(1)
  if (l) {
    let code = await (await fetch(l)).text()
    newFile.editor.content = code
    emitter.emit('render')
  }
  window.addEventListener('hashchange', async () => {
    console.log('hash changed')
    let l = location.hash.slice(1)
    if (l) {
      let code = await (await fetch(l)).text()
      let editor = state.editingFile.editor.editor
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: code
        }
      })
    }
  })

  state.editingFile = newFile

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
    state.readingUntil = '>>>'
    state.readingBuffer = ''
    const promise = new Promise((resolve, reject) => {
      state.resolveReadingUntilPromise = resolve
    })
    // this will stop execution and exit raw repl if it's the case
    write('\x03\x02')
    await promise
    state.readingUntil = null
    state.readingBuffer = ''
    state.resolveReadingUntilPromise = null
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
    state.readingUntil = 'raw REPL; CTRL-B to exit'
    state.readingBuffer = ''
    const promise = new Promise((resolve, reject) => {
      state.resolveReadingUntilPromise = resolve
    })
    write('\x01')
    await promise
    state.readingUntil = null
    state.readingBuffer = ''
    state.resolveReadingUntilPromise = null
  }
  async function exitRawRepl() {
    state.readingUntil = '>>>'
    state.readingBuffer = ''
    const promise = new Promise((resolve, reject) => {
      state.resolveReadingUntilPromise = resolve
    })
    write('\x02')
    await promise
    state.readingUntil = null
    state.readingBuffer = ''
    state.resolveReadingUntilPromise = null
  }
  async function executeRaw(code) {
    state.readingUntil = '\x04>'
    state.readingBuffer = ''
    const promise = new Promise((resolve, reject) => {
      state.resolveReadingUntilPromise = resolve
    })
    await write(code)
    await write('\x04')
    await promise
    state.readingUntil = null
    state.readingBuffer = ''
    state.resolveReadingUntilPromise = null
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
    // emitter.emit('refresh-files')
    emitter.emit('render')
  })

  // CODE EXECUTION
  emitter.on('run', async () => {
    await getPrompt()
    log('run')
    if (state.readingUntil) {
      alert('Hold on!')
      alert('You are already running code!')
      return false
    }
    const code = state.editingFile.editor.editor.state.doc.toString()
    sessionStorage.setItem('code', code)
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
      await sleep(10)
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
    log('data', data)
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

  function createFile(args) {
    const {
      source,
      parentFolder,
      fileName,
      content = newFileContent,
      hasChanges = false
    } = args
    const id = generateHash()
    const editor = state.cache(CodeMirrorEditor, `editor_${id}`)
    try {
      let code = sessionStorage.getItem('code')
      editor.content = code
    } catch(e) {
      editor.content = content
    }
    return {
      id,
      source,
      parentFolder,
      fileName,
      editor,
      hasChanges
    }
  }

  function createEmptyFile({ source, parentFolder }) {
    return createFile({
      fileName: generateFileName(),
      parentFolder,
      source,
      hasChanges: true
    })
  }
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
