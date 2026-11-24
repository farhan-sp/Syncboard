import { contextBridge, ipcRenderer } from 'electron';

const islandApi = {
  // Listen for broadcasted events
  onEvent: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'theme:changed',
      'island:activity',
      'island:activity-update',
      'island:clipboard-auto-copied',
      'island:toggle',
      'island:settings',
      'devices:update',
      'transfers:update',
      'transfer:offer',
      'transfer:progress',
      'transfer:done',
      'transfer:error',
      'text:received',
      'connection:status',
      'settings:update',
      'event:device-status',
      'event:transfer-update',
      'event:transfer-progress',
      'event:file-offer',
      'event:pair-request',
    ];
    if (validChannels.includes(channel)) {
      const sub = (_event: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
  },

  // Set window state / bounds
  setBounds: (stateName: string, bounds?: { width: number; height: number }) => {
    return ipcRenderer.invoke('island:set-bounds', { stateName, bounds });
  },

  // Focus or blur requests
  requestExpand: () => ipcRenderer.invoke('island:request-expand'),
  requestCollapse: () => ipcRenderer.invoke('island:request-collapse'),

  // Actions
  action: (name: string, payload?: any) => {
    const validActions = [
      'sendText',
      'sendFiles',
      'selectFilesToSend',
      'getTransfersFresh',
      'respondFileOffer',
      'cancelTransfer',
      'retryTransfer',
      'deleteTransfer',
      'pinTransfer',
      'clearAllTransfers',
      'copyToClipboard',
      'openExternal',
      'openFolder',
      'openMainWindow',
      'openPairModal',
      'openSettings',
      'selectDownloadDir',
      'getSettings',
      'saveSetting',
      'getDevices',
      'getTransfers',
      'getNetworkInfo',
    ];
    if (validActions.includes(name)) {
      return ipcRenderer.invoke('island:action', { name, payload });
    }
    return Promise.reject(new Error(`Invalid action: ${name}`));
  },

  // Convenience wrappers matching syncboard API so hooks can run seamlessly
  getSettings: () => ipcRenderer.invoke('island:action', { name: 'getSettings' }),
  saveSetting: (key: string, value: any) =>
    ipcRenderer.invoke('island:action', { name: 'saveSetting', payload: { key, value } }),
  getDevices: () => ipcRenderer.invoke('island:action', { name: 'getDevices' }),
  getTransfers: () => ipcRenderer.invoke('island:action', { name: 'getTransfers' }),
  getNetworkInfo: () => ipcRenderer.invoke('island:action', { name: 'getNetworkInfo' }),
  sendText: (text: string, kind?: string) =>
    ipcRenderer.invoke('island:action', { name: 'sendText', payload: { text, kind } }),
  sendFiles: (paths: string[]) =>
    ipcRenderer.invoke('island:action', { name: 'sendFiles', payload: { paths } }),
  selectFilesToSend: () =>
    ipcRenderer.invoke('island:action', { name: 'selectFilesToSend' }),
  getTransfersFresh: () =>
    ipcRenderer.invoke('island:action', { name: 'getTransfersFresh' }),
  respondFileOffer: (payload: any) =>
    ipcRenderer.invoke('island:action', { name: 'respondFileOffer', payload }),
  cancelTransfer: (id: string) =>
    ipcRenderer.invoke('island:action', { name: 'cancelTransfer', payload: { id } }),
  retryTransfer: (id: string) =>
    ipcRenderer.invoke('island:action', { name: 'retryTransfer', payload: { id } }),
  deleteTransfer: (id: string) =>
    ipcRenderer.invoke('island:action', { name: 'deleteTransfer', payload: { id } }),
  pinTransfer: (id: string, pinned: number) =>
    ipcRenderer.invoke('island:action', { name: 'pinTransfer', payload: { id, pinned } }),
  clearAllTransfers: () => ipcRenderer.invoke('island:action', { name: 'clearAllTransfers' }),
  copyToClipboard: (text: string) =>
    ipcRenderer.invoke('island:action', { name: 'copyToClipboard', payload: { text } }),
  openExternal: (url: string) =>
    ipcRenderer.invoke('island:action', { name: 'openExternal', payload: { url } }),
  openFileLocation: (path: string) =>
    ipcRenderer.invoke('island:action', { name: 'openFolder', payload: { path } }),
  selectDownloadDir: () => ipcRenderer.invoke('island:action', { name: 'selectDownloadDir' }),
  openMainWindow: () => ipcRenderer.invoke('island:action', { name: 'openMainWindow' }),
  openPairModal: () => ipcRenderer.invoke('island:action', { name: 'openPairModal' }),

  onSettingsUpdate: (cb: (data: any) => void) => {
    const sub = (_e: any, d: any) => cb(d);
    ipcRenderer.on('settings:update', sub);
    return () => ipcRenderer.removeListener('settings:update', sub);
  },
  onDeviceStatusChange: (cb: (devices: any[]) => void) => {
    const sub = (_e: any, d: any) => cb(d);
    ipcRenderer.on('devices:update', sub);
    ipcRenderer.on('event:device-status', sub);
    return () => {
      ipcRenderer.removeListener('devices:update', sub);
      ipcRenderer.removeListener('event:device-status', sub);
    };
  },
  onTransferUpdate: (cb: (transfer: any) => void) => {
    const sub = (_e: any, d: any) => cb(d);
    ipcRenderer.on('transfers:update', sub);
    ipcRenderer.on('event:transfer-update', sub);
    return () => {
      ipcRenderer.removeListener('transfers:update', sub);
      ipcRenderer.removeListener('event:transfer-update', sub);
    };
  },
  onTransferProgress: (cb: (data: any) => void) => {
    const sub = (_e: any, d: any) => cb(d);
    ipcRenderer.on('transfer:progress', sub);
    ipcRenderer.on('event:transfer-progress', sub);
    return () => {
      ipcRenderer.removeListener('transfer:progress', sub);
      ipcRenderer.removeListener('event:transfer-progress', sub);
    };
  },
  onFileOffer: (cb: (data: any) => void) => {
    const sub = (_e: any, d: any) => cb(d);
    ipcRenderer.on('transfer:offer', sub);
    ipcRenderer.on('event:file-offer', sub);
    return () => {
      ipcRenderer.removeListener('transfer:offer', sub);
      ipcRenderer.removeListener('event:file-offer', sub);
    };
  },
};

contextBridge.exposeInMainWorld('island', islandApi);
contextBridge.exposeInMainWorld('syncboard', islandApi);

export type IslandApi = typeof islandApi;
