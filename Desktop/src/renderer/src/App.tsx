import React, { useState, useEffect } from 'react';
import {
  DeviceModel,
  TransferModel,
  AppSettings,
  NetworkInfo,
  PendingPairRequest,
  PendingFileOffer,
} from '@shared/types';
import { KirimPage } from './pages/Kirim';
import { RiwayatPage } from './pages/Riwayat';
import { PerangkatPage } from './pages/Perangkat';
import { PengaturanPage } from './pages/Pengaturan';
import { DropZone } from './components/DropZone';
import { QRDialog } from './components/QRDialog';
import {
  Send,
  Clock,
  Smartphone,
  Settings,
  QrCode,
  AlertTriangle,
  FileText,
  X,
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kirim' | 'riwayat' | 'perangkat' | 'pengaturan'>('kirim');
  const [devices, setDevices] = useState<DeviceModel[]>([]);
  const [activeDevice, setActiveDevice] = useState<DeviceModel | null>(null);
  const [transfers, setTransfers] = useState<TransferModel[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    serverPort: 48620,
    deviceName: 'SyncBoard Desktop',
    downloadDir: '',
    confirmBeforeReceive: true,
    historyMode: 'simpan',
    retentionHours: 24,
    theme: 'dark',
    startWithSystem: false,
  });
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [pendingPairRequest, setPendingPairRequest] = useState<PendingPairRequest | null>(null);
  const [pendingFileOffer, setPendingFileOffer] = useState<PendingFileOffer | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [secretWarning, setSecretWarning] = useState<string | null>(null);

  // Load initial data
  const loadInitialData = async () => {
    try {
      const api = (window as any).syncboard;
      if (!api) return;

      const [loadedSettings, loadedNetInfo, loadedDevices, loadedTransfers] = await Promise.all([
        api.getSettings?.(),
        api.getNetworkInfo?.(),
        api.getDevices?.(),
        api.getTransfers?.(),
      ]);

      if (loadedSettings) setSettings(loadedSettings);
      if (loadedNetInfo) setNetworkInfo(loadedNetInfo);
      if (loadedDevices) {
        setDevices(loadedDevices);
        if (loadedDevices.length > 0) {
          const connected = loadedDevices.find((d: DeviceModel) => d.status === 'connected');
          setActiveDevice(connected || loadedDevices[0]);
        }
      }
      if (loadedTransfers) setTransfers(loadedTransfers);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadInitialData();

    const api = (window as any).syncboard;
    if (!api) return;

    // Listen for incoming pair requests
    const unsubPair = api.onPairRequest?.((data: PendingPairRequest) => {
      setPendingPairRequest(data);
      setIsQRModalOpen(true);
    });

    // Listen for device status updates
    const unsubDevice = api.onDeviceStatusChange?.((updatedDevices: DeviceModel[]) => {
      setDevices(updatedDevices);
      if (activeDevice) {
        const found = updatedDevices.find((d) => d.id === activeDevice.id);
        if (found) setActiveDevice(found);
      }
    });

    // Listen for transfer updates
    const unsubTransfer = api.onTransferUpdate?.((updatedTransfer: TransferModel) => {
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.id === updatedTransfer.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedTransfer;
          return next;
        }
        return [updatedTransfer, ...prev];
      });
    });

    // Listen for incoming file offer approval requests
    const unsubFileOffer = api.onFileOffer?.((data: PendingFileOffer) => {
      setPendingFileOffer(data);
    });

    // Listen for transfer progress updates
    const unsubProgress = api.onTransferProgress?.((data: { id: string; bytesReceived: number }) => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === data.id ? { ...t, bytesTransferred: data.bytesReceived } : t))
      );
    });

    // Listen for Linux secret store warning
    const unsubSecret = api.onSecretStoreWarning?.((data: { warning: string }) => {
      setSecretWarning(data.warning);
    });

    return () => {
      unsubPair?.();
      unsubDevice?.();
      unsubTransfer?.();
      unsubSecret?.();
      unsubFileOffer?.();
      unsubProgress?.();
    };
  }, []);

  // Global Drag and Drop handlers
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragging(false);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleSendText = async (text: string, kind: 'text' | 'link') => {
    const api = (window as any).syncboard;
    if (!api) return;
    await api.sendText({ text, kind, deviceId: activeDevice?.id });
    const fresh = await api.getTransfers();
    if (fresh) setTransfers(fresh);
  };

  const handleSendFiles = async (filePaths: string[]) => {
    const api = (window as any).syncboard;
    if (!api) return;
    for (const filePath of filePaths) {
      await api.sendFile({ filePath, deviceId: activeDevice?.id });
    }
    const fresh = await api.getTransfers();
    if (fresh) setTransfers(fresh);
  };

  const handleDropFiles = async (files: FileList) => {
    setIsDragging(false);
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i] as any;
      if (file.path) paths.push(file.path);
    }
    if (paths.length > 0) {
      await handleSendFiles(paths);
    }
  };

  const handleRespondPair = async (requestId: string, accept: boolean) => {
    const api = (window as any).syncboard;
    if (api) {
      await api.respondPairRequest({ requestId, accept });
    }
    setPendingPairRequest(null);
    setIsQRModalOpen(false);
    const freshDevices = await api?.getDevices?.();
    if (freshDevices) setDevices(freshDevices);
  };

  const handleUpdateSetting = async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    const api = (window as any).syncboard;
    if (api) {
      await api.saveSetting(key as string, value);
    }
  };

  const handleSelectDownloadDir = async () => {
    const api = (window as any).syncboard;
    if (api) {
      const selected = await api.selectDownloadDir();
      if (selected) {
        setSettings((prev) => ({ ...prev, downloadDir: selected }));
      }
    }
  };

  const handleClearAllHistory = async () => {
    if (confirm('Yakin ingin menghapus seluruh riwayat transfer dari komputer ini?')) {
      const api = (window as any).syncboard;
      if (api) {
        await api.clearAllTransfers();
        setTransfers([]);
      }
    }
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Drag & Drop full window overlay */}
      <DropZone
        isDragging={isDragging}
        targetDeviceName={activeDevice?.name}
        onDropFiles={handleDropFiles}
      />

      {/* QR Pairing Dialog */}
      <QRDialog
        isOpen={isQRModalOpen}
        onClose={() => {
          setIsQRModalOpen(false);
          setPendingPairRequest(null);
        }}
        pendingPairRequest={pendingPairRequest}
        onRespondPair={handleRespondPair}
      />

      {/* Incoming File Offer Approval Dialog */}
      {pendingFileOffer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 glow-teal shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-100 truncate">
                  Terima Berkas Masuk?
                </h3>
                <p className="text-xs text-slate-400 truncate">
                  Dari {pendingFileOffer.deviceName}
                </p>
              </div>
            </div>

            <div className="bg-slate-950/60 rounded-2xl p-4 border border-white/5 space-y-2">
              <div className="text-xs text-slate-400">Nama Berkas:</div>
              <div className="text-sm font-semibold text-slate-200 truncate font-mono">
                {pendingFileOffer.name}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2 pt-1">
                <span>Ukuran: {formatBytes(pendingFileOffer.size)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={async () => {
                  const offerId = pendingFileOffer.id;
                  setPendingFileOffer(null);
                  await (window as any).syncboard?.respondFileOffer({
                    offerId,
                    accept: false,
                  });
                }}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
              >
                Tolak
              </button>
              <button
                onClick={async () => {
                  const offerId = pendingFileOffer.id;
                  setPendingFileOffer(null);
                  await (window as any).syncboard?.respondFileOffer({
                    offerId,
                    accept: true,
                  });
                }}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition-colors shadow-lg shadow-teal-500/20"
              >
                Izinkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-white/5 flex flex-col p-5 shrink-0 select-none">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-6 px-1">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-blue-500 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-teal-500/25 glow-teal">
            <Send className="w-5 h-5 -rotate-45" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white">
              SyncBoard
            </h1>
            <span className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider block">
              P2P Lokal Wi-Fi
            </span>
          </div>
        </div>

        {/* Linux Secret Warning Banner if no OS keyring */}
        {secretWarning && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{secretWarning}</span>
            </div>
            <button onClick={() => setSecretWarning(null)} className="text-amber-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Nav Items */}
        <nav className="space-y-1.5 flex-1">
          <button
            onClick={() => setActiveTab('kirim')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'kirim'
                ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 text-teal-300 border border-teal-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Kirim</span>
          </button>

          <button
            onClick={() => setActiveTab('riwayat')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'riwayat'
                ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 text-teal-300 border border-teal-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Riwayat</span>
          </button>

          <button
            onClick={() => setActiveTab('perangkat')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'perangkat'
                ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 text-teal-300 border border-teal-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-4 h-4" />
              <span>Perangkat</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-300 font-mono">
              {devices.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('pengaturan')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'pengaturan'
                ? 'bg-gradient-to-r from-teal-500/20 to-teal-500/5 text-teal-300 border border-teal-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Pengaturan</span>
          </button>
        </nav>

        {/* Bottom QR Trigger */}
        <div className="pt-4 border-t border-white/5">
          <button
            onClick={() => setIsQRModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 transition-all glow-teal"
          >
            <QrCode className="w-4 h-4" />
            <span>Tampilkan QR Pasangan</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'kirim' && (
          <KirimPage
            devices={devices}
            activeDevice={activeDevice}
            onSelectDevice={(dev) => setActiveDevice(dev)}
            transfers={transfers}
            onSendText={handleSendText}
            onSendFiles={handleSendFiles}
            onOpenFolder={(path) => (window as any).syncboard?.openFileLocation(path)}
            onRetry={async (id) => {
              await (window as any).syncboard?.retryTransfer(id);
              const fresh = await (window as any).syncboard?.getTransfers();
              if (fresh) setTransfers(fresh);
            }}
            onCancel={async (id) => {
              await (window as any).syncboard?.cancelTransfer(id);
              const fresh = await (window as any).syncboard?.getTransfers();
              if (fresh) setTransfers(fresh);
            }}
            onOpenPairModal={() => setIsQRModalOpen(true)}
          />
        )}

        {activeTab === 'riwayat' && (
          <RiwayatPage
            transfers={transfers}
            onDelete={async (id) => {
              await (window as any).syncboard?.deleteTransfer(id);
              setTransfers((prev) => prev.filter((t) => t.id !== id));
            }}
            onPin={async (id, pinned) => {
              await (window as any).syncboard?.pinTransfer(id, pinned);
              setTransfers((prev) =>
                prev.map((t) => (t.id === id ? { ...t, pinned } : t))
              );
            }}
            onOpenFolder={(path) => (window as any).syncboard?.openFileLocation(path)}
            onClearAll={handleClearAllHistory}
          />
        )}

        {activeTab === 'perangkat' && (
          <PerangkatPage
            devices={devices}
            networkInfo={networkInfo}
            onRenameDevice={async (id, newName) => {
              await (window as any).syncboard?.renameDevice(id, newName);
              setDevices((prev) =>
                prev.map((d) => (d.id === id ? { ...d, name: newName } : d))
              );
            }}
            onDisconnectDevice={async (id) => {
              await (window as any).syncboard?.disconnectDevice(id);
              const fresh = await (window as any).syncboard?.getDevices();
              if (fresh) setDevices(fresh);
            }}
            onRemoveDevice={async (id) => {
              if (confirm('Yakin ingin menghapus perangkat ini dan mencabut kepercayaannya?')) {
                await (window as any).syncboard?.removeDevice(id);
                setDevices((prev) => prev.filter((d) => d.id !== id));
                if (activeDevice?.id === id) setActiveDevice(null);
              }
            }}
            onOpenPairModal={() => setIsQRModalOpen(true)}
          />
        )}

        {activeTab === 'pengaturan' && (
          <PengaturanPage
            settings={settings}
            onUpdateSetting={handleUpdateSetting}
            onSelectDownloadDir={handleSelectDownloadDir}
            onClearAllHistory={handleClearAllHistory}
          />
        )}
      </main>
    </div>
  );
};
