const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('claude', {
  ask: prompt => ipcRenderer.invoke('ask-claude', prompt),
});
