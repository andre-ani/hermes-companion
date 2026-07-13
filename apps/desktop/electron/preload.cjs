const { contextBridge, ipcRenderer } = require('electron');

const allowed = new Set([
  'git.status', 'git.diff', 'git.commit.metadata', 'git.worktree.create', 'git.worktree.attach', 'git.worktree.detach', 'git.worktree.remove', 'git.commit', 'git.push', 'git.github.status', 'git.pr.view',
  'pty.open', 'pty.write', 'pty.resize', 'pty.read', 'pty.close', 'preview.register', 'preview.open', 'notification.status', 'notification.show', 'app.info'
]);

contextBridge.exposeInMainWorld('companion', {
  platform: process.platform,
  invoke: (capability, input) => {
    if (!allowed.has(capability)) return Promise.reject(new Error('Capability is not exposed to the renderer.'));
    return ipcRenderer.invoke('native:invoke', capability, input);
  },
  onAnnotation: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('design:annotation', handler);
    return () => ipcRenderer.removeListener('design:annotation', handler);
  }
});
