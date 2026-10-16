import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get-all'),
  saveSetting: (key: string, val: any) => {
    if (typeof key !== 'string') return Promise.reject(new Error('Invalid key'));
    return ipcRenderer.invoke('settings:save', { key, val });
  },
  selectDownloadDir: () => ipcRenderer.invoke('settings:select-dir'),

  // Network & Troubleshooting
  getNetworkInfo: () => ipcRenderer.invoke('network:get-info'),
  getTroubleshootingHelp: () => ipcRenderer.invoke('network:get-troubleshooting'),

  // Devices
  getDevices: () => ipcRenderer.invoke('devices:get-all'),
  renameDevice: (id: string, name: string) => {
    if (!id || typeof name !== 'string') return Promise.reject(new Error('Invalid parameters'));
    return ipcRenderer.invoke('devices:rename', { id, name });
  },
  disconnectDevice: (id: string) => {
    if (!id) return Promise.reject(new Error('Device ID required'));
    return ipcRenderer.invoke('devices:disconnect', { id });
  },
  removeDevice: (id: string) => {
    if (!id) return Promise.reject(new Error('Device ID required'));
    return ipcRenderer.invoke('devices:remove', { id });
  },

  // Transfers
  getTransfers: (filter: any) => ipcRenderer.invoke('transfers:get-all', filter || {}),
  deleteTransfer: (id: string) => {
    if (!id) return Promise.reject(new Error('Transfer ID required'));
    return ipcRenderer.invoke('transfers:delete', { id });
  },
  clearAllTransfers: () => ipcRenderer.invoke('transfers:clear-all'),
  pinTransfer: (id: string, pinned: number) => {
    if (!id) return Promise.reject(new Error('Transfer ID required'));
    return ipcRenderer.invoke('transfers:pin', { id, pinned });
  },
  sendText: (params: { text: string; kind: 'text' | 'link'; deviceId?: string }) => {
    if (!params || !params.text) return Promise.reject(new Error('Text content required'));
    return ipcRenderer.invoke('transfers:send-text', params);
  },
  sendFile: (params: { filePath: string; deviceId?: string }) => {
    if (!params || !params.filePath) return Promise.reject(new Error('File path required'));
    return ipcRenderer.invoke('transfers:send-file', params);
  },
  selectFilesToSend: () => ipcRenderer.invoke('transfers:select-files'),
  cancelTransfer: (id: string) => {
    if (!id) return Promise.reject(new Error('Transfer ID required'));
    return ipcRenderer.invoke('transfers:cancel', { id });
  },
  retryTransfer: (id: string) => {
    if (!id) return Promise.reject(new Error('Transfer ID required'));
    return ipcRenderer.invoke('transfers:retry', { id });
  },

  // Pairing
  createPairingSession: () => ipcRenderer.invoke('pairing:create-session'),
  respondPairRequest: (response: { requestId: string; accept: boolean }) => {
    return ipcRenderer.invoke('pairing:respond', response);
  },

  // File Offer Response
  respondFileOffer: (response: { offerId: string; accept: boolean }) => {
    return ipcRenderer.invoke('transfers:respond-offer', response);
  },

  // System Helpers
  copyToClipboard: (text: string) => {
    if (typeof text !== 'string') return Promise.reject(new Error('String expected'));
    return ipcRenderer.invoke('system:copy-clipboard', { text });
  },
  openFileLocation: (filePath: string) => {
    if (typeof filePath !== 'string') return Promise.reject(new Error('Path expected'));
    return ipcRenderer.invoke('system:open-file-location', { filePath });
  },

  // Real-time Event Listeners
  onDeviceStatusChange: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('event:device-status', subscription);
    return () => ipcRenderer.removeListener('event:device-status', subscription);
  },

  onTransferUpdate: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('event:transfer-update', subscription);
    return () => ipcRenderer.removeListener('event:transfer-update', subscription);
  },

  onPairRequest: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('event:pair-request', subscription);
    return () => ipcRenderer.removeListener('event:pair-request', subscription);
  },

  onFileOffer: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('event:file-offer', subscription);
    return () => ipcRenderer.removeListener('event:file-offer', subscription);
  },

  onSecretStoreWarning: (callback: (data: { warning: string }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('event:secret-store-warning', subscription);
    return () => ipcRenderer.removeListener('event:secret-store-warning', subscription);
  },

  onTransferProgress: (callback: (data: { id: string; bytesReceived: number }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('event:transfer-progress', subscription);
    return () => ipcRenderer.removeListener('event:transfer-progress', subscription);
  },
};

contextBridge.exposeInMainWorld('syncboard', api);

export type SyncBoardApi = typeof api;
