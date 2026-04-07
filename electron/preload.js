// Preload scripts run in a context that has access to both Node.js APIs
// and a renderer's web page DOM. We use context bridging to expose
// only safe APIs to the renderer.

const { contextBridge, ipcRenderer } = require('electron');
const { dialog } = require('electron');

// Expose protected methods that allow the renderer process to use
// the IPC renderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'clawideAPI', {
    // Dialogs
    openDialog: (options) => ipcRenderer.invoke('open-dialog', options),
    saveDialog: (options) => ipcRenderer.invoke('save-dialog', options),
    
    // File operations
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
    listDirectory: (directoryPath) => ipcRenderer.invoke('list-directory', directoryPath),
    
    // Application actions
    invokeAction: (action, data) => ipcRenderer.send('action', action, data),
    
    // Utilities
    isMac: () => process.platform === 'darwin',
    getAppVersion: () => app.getVersion()
  }
);

// Also expose some basic Electron info for debugging/development
if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld(
    'electronAPI', {
      // Only expose safe, read-only properties in production
      getPlatform: () => process.platform,
      isPackaged: () => app.isPackaged
    }
  );
}
