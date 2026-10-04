// Stub for web-ext-run; see DEVELOPMENT.md. vite-plugin-web-extension imports
// it at top level but only calls `cmd.run` when launching a browser.
const unsupported = () => {
  throw new Error('web-ext-run is stubbed in this repo; the browser-launch mode of vite-plugin-web-extension is not supported');
};

export default { cmd: { run: unsupported } };
