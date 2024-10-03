export function Welcome(state, emit) {
  if (!state.welcomed) {
    function dismiss(e) {
      if (e.target.id == 'modal') {
        emit('dismiss-welcome')
      }
    }
    function dontShow(e) {
      emit('set-welcomed', e.target.checked)
    }
    return html`
      <div id="modal" onclick=${dismiss}>
        <div class="dialog">
          <div class="header">
            <div class="title">
              Welcome
            </div>
          </div>
          <div class="content">
            <div class="image">
              <img src="media/welcome_editor.png" width="218" height="140" style="align-self: flex-end" />
            </div>
            <div class="body">
              <h1>Welcome to Arduino Lab for MicroPython </h1>
              <p>
                This software is part of Arduino LABS program, for experimental use only.
              </p>
              <p>Requires: <strong>Chrome browser</strong></p>
              <p>
                <a target="_blank" href="https://www.arduino.cc/en/terms-conditions">
                  Terms of Service
                </a>
              </p>
            </div>
          </div>
          <div class="call-to-action">
            <div class="checkbox">
              <input type="checkbox" id="dontshow" onchange=${dontShow} />
              <label for="dontshow">Don't show again</label>
            </div>
            <div class="primary">
              <button onclick=${() => emit('dismiss-welcome')}>ok, got it</button>
            </div>
          </div>
        </div>
      </div>
    `
  }
}
