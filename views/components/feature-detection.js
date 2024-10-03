export function FeatureDetection(state, emit) {
  async function copyToClipboard() {
    await navigator.clipboard.writeText(location.href)
  }
  return html`
    <div id="modal">
      <div class="dialog">
        <div class="header">
          <div class="title">
            WebSerial not available
          </div>
        </div>
        <div class="content">
          <div class="image">
            <img src="media/welcome_support.png" width="250" height="160" />
          </div>
          <div class="body">
            <h1>Your browser is not currently supported</h1>
            <p>
              In order to use Arduino Lab for MicroPython, please switch to a
              browser that supports <strong>WebSerial</strong> like Chrome, Edge or Opera.
            </p>
          </div>
        </div>
        <div class="call-to-action">
          <div></div>
          <div class="primary">
            <button onclick=${copyToClipboard}>
              <img src="media/files_white.svg" width="12" height="13" />
              copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  `
}
