import { CodeMirrorEditor } from './views/components/elements/editor.js'


export const newFileContent = ``

export const HELPER_CODE = `import os
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

export function sleep(millis) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, millis)
  })
}

export function generateHash() {
  return `${Date.now()}_${parseInt(Math.random()*1024)}`
}

export function generateFileName(filename) {
  if (filename) {
    let name = filename.split('.py')
    return `${name[0]}_${Date.now()}.py`
  } else {
    return `${pickRandom(adjectives)}_${pickRandom(nouns)}.py`
  }
}

export function pickRandom(array) {
  return array[parseInt(Math.random()*array.length)]
}

export function fileCreator(cache) {
  function createFile(args) {
    const {
      path,
      content = newFileContent,
      hasChanges = false
    } = args
    const id = generateHash()
    const editor = cache(CodeMirrorEditor, `editor_${id}`)
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
    }, cache)
  }
  return { createFile, createEmptyFile }
}
