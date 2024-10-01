export function Overlay(state, emit) {
  let overlay = html`<div id="overlay" class="closed"></div>`

  if (!('serial' in navigator)) {
    return html`
      <div id="overlay" class="open">
        <div class="message">
          <p>This website uses WebSerial and your current browser doesn't support it.</p>
          <p>In order to use Arduino Lab for MicroPython, please switch to a browser that <a target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API#browser_compatibility">supports</a> WebSerial like Chrome, Edge or Opera.</p>
        </div>
      </div>
    `
  }

  if (state.isRemoving) overlay = html`<div id="overlay" class="open"><p>Removing...</p></div>`
  if (state.isConnecting) overlay = html`<div id="overlay" class="open"><p>Connecting...</p></div>`
  if (state.isLoadingFiles) overlay = html`<div id="overlay" class="open"><p>Loading files...</p></div>`
  if (state.isSaving) overlay = html`<div id="overlay" class="open"><p>Saving file...</p></div>`
  if (state.isUploading) overlay = html`<div id="overlay" class="open"><p>Uploading file...</p></div>`
  if (state.isDownloading) overlay = html`<div id="overlay" class="open"><p>Downloading file...</p></div>`

  return overlay
}
