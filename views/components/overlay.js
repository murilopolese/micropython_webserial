export function Overlay(state, emit) {
  let overlay = html`<div id="overlay" class="closed"></div>`

  if (state.isRemoving) overlay = html`<div id="overlay" class="open"><p>Removing...</p></div>`
  if (state.isConnecting) overlay = html`<div id="overlay" class="open"><p>Connecting...</p></div>`
  if (state.isLoadingFiles) overlay = html`<div id="overlay" class="open"><p>Loading files...</p></div>`
  if (state.isSaving) overlay = html`<div id="overlay" class="open"><p>Saving file...</p></div>`
  if (state.isUploading) overlay = html`<div id="overlay" class="open"><p>Uploading file...</p></div>`
  if (state.isDownloading) overlay = html`<div id="overlay" class="open"><p>Downloading file...</p></div>`

  return overlay
}
