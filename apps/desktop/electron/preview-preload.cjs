const { contextBridge, ipcRenderer } = require('electron');

if (process.argv.includes('--hermes-design-mode')) {
  contextBridge.exposeInMainWorld('__HERMES_DESIGN_BRIDGE__', {
    version: 1,
    annotate(payload) {
      if (!payload || typeof payload !== 'object') throw new Error('Annotation payload is required.');
      ipcRenderer.send('design:annotation', {
        route: location.pathname,
        selectedElement: payload.selectedElement,
        screenshot: payload.screenshot,
        note: payload.note
      });
    }
  });
}
