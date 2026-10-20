/**
 * Script de préchargement Electron
 * Expose des APIs sécurisées au renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  onSync: (callback) => ipcRenderer.on('sync-status', (_, data) => callback(data)),
  onDataUpdated: (callback) => ipcRenderer.on('data-updated', (_, data) => callback(data)),
});