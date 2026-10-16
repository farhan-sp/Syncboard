const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('syncboard', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  saveSetting: (key, val) => ipcRenderer.invoke('settings:save', { key, val }),
  selectDownloadDir: () => ipcRenderer.invoke('settings:select-dir'),

  // Network & Troubleshooting
  getNetworkInfo: () => ipcRenderer.invoke('network:get-info'),
  getTroubleshootingHelp: () => ipcRenderer.invoke('network:get-troubleshooting'),

  // Devices
  getDevices: () => ipcRenderer.invoke('devices:get-all'),
  renameDevice: (id, name) => ipcRenderer.invoke('devices:rename', { id, name }),
  disconnectDevice: (id) => ipcRenderer.invoke('devices:disconnect', { id }),
  removeDevice: (id) => ipcRenderer.invoke('devices:remove', { id }),

  // Transfers
  getTransfers: (filter) => ipcRenderer.invoke('transfers:get-all', filter || {}),
  deleteTransfer: (id) => ipcRenderer.invoke('transfers:delete', { id }),
  clearAllTransfers: () => ipcRenderer.invoke('transfers:clear-all'),
  pinTransfer: (id, pinned) => ipcRenderer.invoke('transfers:pin', { id, pinned }),
  sendText: (params) => ipcRenderer.invoke('transfers:send-text', params),
  sendFile: (params) => ipcRenderer.invoke('transfers:send-file', params),
  selectFilesToSend: () => ipcRenderer.invoke('transfers:select-files'),
  cancelTransfer: (id) => ipcRenderer.invoke('transfers:cancel', { id }),
  retryTransfer: (id) => ipcRenderer.invoke('transfers:retry', { id }),

  // Pairing
  createPairingSession: () => ipcRenderer.invoke('pairing:create-session'),
  respondPairRequest: (response) => ipcRenderer.invoke('pairing:respond', response),

  // File Offer Response
  respondFileOffer: (response) => ipcRenderer.invoke('transfers:respond-offer', response),

  // System Helpers
  copyToClipboard: (text) => ipcRenderer.invoke('system:copy-clipboard', { text }),
  openFileLocation: (filePath) => ipcRenderer.invoke('system:open-file-location', { filePath }),

  // Event Listeners from Main Process
  onDeviceStatusChange: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('event:device-status', subscription);
    return () => ipcRenderer.removeListener('event:device-status', subscription);
  },

  onTransferUpdate: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('event:transfer-update', subscription);
    return () => ipcRenderer.removeListener('event:transfer-update', subscription);
  },

  onPairRequest: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('event:pair-request', subscription);
    return () => ipcRenderer.removeListener('event:pair-request', subscription);
  },

  onFileOffer: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('event:file-offer', subscription);
    return () => ipcRenderer.removeListener('event:file-offer', subscription);
  },

  onSecretStoreWarning: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('event:secret-store-warning', subscription);
    return () => ipcRenderer.removeListener('event:secret-store-warning', subscription);
  },

  onTransferProgress: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('event:transfer-progress', subscription);
    return () => ipcRenderer.removeListener('event:transfer-progress', subscription);
  },
});
