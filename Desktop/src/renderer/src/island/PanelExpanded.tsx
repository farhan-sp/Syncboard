import React, { useState } from 'react';
import {
  Send,
  Upload,
  FolderOpen,
  Copy,
  Check,
  ChevronUp,
  Laptop,
  Smartphone,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
  Trash2,
  Unlink,
  Plus,
  RefreshCw,
  File,
  MessageSquare,
  Link as LinkIcon,
} from 'lucide-react';
import { IslandTab } from './reducer';
import { DeviceModel, TransferModel, AppSettings } from '@shared/types';
import { TransferStatusChip } from '../components/TransferStatusChip';

interface PanelExpandedProps {
  activeTab: IslandTab;
  onSelectTab: (tab: IslandTab) => void;
  onCollapse: () => void;
  devices: DeviceModel[];
  activeDevice: DeviceModel | null;
  transfers: TransferModel[];
  settings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  onSendText: (text: string, kind?: 'text' | 'link') => Promise<void>;
  onSendFiles: (filePaths: string[]) => Promise<void>;
  onSelectFiles: () => Promise<string[] | null>;
  onDisconnectDevice?: (id: string) => Promise<any>;
  onRemoveDevice?: (id: string) => Promise<any>;
  onOpenMainWindow: () => void;
  onOpenPairModal: () => void;
}

export const PanelExpanded: React.FC<PanelExpandedProps> = ({
  activeTab,
  onSelectTab,
  onCollapse,
  devices,
  activeDevice,
  transfers,
  settings,
  onUpdateSetting,
  onSendText,
  onSendFiles,
  onSelectFiles,
  onDisconnectDevice,
  onRemoveDevice,
  onOpenMainWindow,
  onOpenPairModal,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isConnected = activeDevice?.status === 'connected';

  const handleSendText = async () => {
    if (!inputText.trim() || isSending) return;
    setIsSending(true);
    try {
      const isUrl = /^https?:\/\//i.test(inputText.trim());
      await onSendText(inputText.trim(), isUrl ? 'link' : 'text');
      setInputText('');
    } catch (err) {
      console.error('Failed to send text:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handlePickFiles = async () => {
    try {
      const files = await onSelectFiles();
      if (files && files.length > 0) {
        await onSendFiles(files);
      }
    } catch (err) {
      console.error('Failed to send files:', err);
    }
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      const api = (window as any).island || (window as any).syncboard;
      if (api?.copyToClipboard) {
        await api.copyToClipboard(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenFileLocation = (path: string) => {
    const api = (window as any).island || (window as any).syncboard;
    if (api?.openFileLocation) {
      api.openFileLocation(path);
    }
  };

  const tabs: { key: IslandTab; label: string }[] = [
    { key: 'kirim', label: 'Kirim' },
    { key: 'riwayat', label: 'Riwayat' },
    { key: 'perangkat', label: 'Perangkat' },
    { key: 'pengaturan', label: 'Pengaturan' },
  ];

  return (
    <div className="w-[520px] h-[470px] rounded-[28px] bg-bg-app border border-border shadow-island flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-200">
      {/* 1. Header */}
      <div className="h-[52px] px-5 flex items-center justify-between border-b border-divider shrink-0">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              isConnected ? 'bg-accent' : 'bg-text-muted'
            }`}
          />
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-semibold text-text">
              {activeDevice?.name || 'SyncBoard Desktop'}
            </span>
            <span className="text-[12px] text-text-muted">
              ({isConnected ? 'Terhubung' : 'Terputus'})
            </span>
          </div>
        </div>

        <button
          onClick={onCollapse}
          aria-label="Tutup panel"
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-control-hover text-text-muted hover:text-text transition-colors"
          title="Tutup panel"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Tab Navigation */}
      <div className="flex items-center px-4 bg-bg-app border-b border-divider shrink-0 gap-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key)}
              className={`flex-1 py-2.5 text-[13px] transition-all relative text-center rounded-t-lg ${
                isActive
                  ? 'bg-nav-active text-text font-semibold shadow-[inset_0_-2px_0] shadow-accent'
                  : 'text-text-muted hover:text-text hover:bg-nav-hover font-medium'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 3. Tab Content Area */}
      <div className="flex-1 p-4 overflow-y-auto min-h-0 text-text">
        {/* TAB 1: KIRIM */}
        {activeTab === 'kirim' && (
          <div className="space-y-4">
            {/* Quick Text / Link Box */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border flex flex-col gap-2.5">
              <label className="text-xs font-semibold text-text-secondary">
                Kirim Teks atau Tautan
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ketik pesan atau tempel tautan di sini..."
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSendText();
                  }
                }}
                className="w-full bg-surface-inset border border-border rounded-xl p-2.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-text-muted">
                  Tekan Ctrl+Enter untuk kirim
                </span>
                <button
                  onClick={handleSendText}
                  disabled={!inputText.trim() || isSending}
                  className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim</span>
                </button>
              </div>
            </div>

            {/* File Transfer Box */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-text">Kirim Berkas</div>
                  <div className="text-[11px] text-text-muted">
                    Pilih berkas dari komputer untuk dikirim
                  </div>
                </div>
              </div>
              <button
                onClick={handlePickFiles}
                className="px-3.5 py-1.5 rounded-lg bg-control hover:bg-control-hover border border-control-border text-text text-xs font-medium transition-colors"
              >
                Pilih Berkas...
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: RIWAYAT */}
        {activeTab === 'riwayat' && (
          <div className="space-y-2.5">
            {transfers.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-text-muted text-xs">
                Belum ada riwayat aktivitas.
              </div>
            ) : (
              transfers.slice(0, 10).map((t) => {
                const isUrl = t.type === 'text' && /^https?:\/\//i.test(t.textContent || '');
                return (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-xl bg-surface border border-border flex items-center justify-between gap-3 hover:border-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-tile flex items-center justify-center shrink-0">
                        {t.type === 'file' ? (
                          <File className="w-4 h-4 text-text-secondary" />
                        ) : isUrl ? (
                          <LinkIcon className="w-4 h-4 text-accent" />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-text-secondary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-text truncate max-w-[220px]">
                          {t.type === 'file' ? t.filename : t.textContent}
                        </div>
                        <div className="text-[10px] text-text-muted flex items-center gap-2">
                          <span>{t.direction === 'incoming' ? 'Masuk' : 'Keluar'}</span>
                          <span>•</span>
                          <span>{new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <TransferStatusChip status={t.status as any} size="sm" />
                      {t.type === 'text' && t.textContent && (
                        <button
                          onClick={() => handleCopyText(t.id, t.textContent!)}
                          className="p-1 rounded-md hover:bg-control-hover text-text-muted hover:text-text transition-colors"
                          title="Salin teks"
                        >
                          {copiedId === t.id ? (
                            <Check className="w-3.5 h-3.5 text-accent" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      {t.type === 'file' && t.filePath && (
                        <button
                          onClick={() => handleOpenFileLocation(t.filePath!)}
                          className="p-1 rounded-md hover:bg-control-hover text-text-muted hover:text-text transition-colors"
                          title="Buka lokasi berkas"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <button
              onClick={onOpenMainWindow}
              className="w-full py-2 text-center text-xs text-accent hover:underline flex items-center justify-center gap-1 mt-2"
            >
              <span>Buka riwayat lengkap di jendela utama</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* TAB 3: PERANGKAT */}
        {activeTab === 'perangkat' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary">
                Perangkat Terpasang ({devices.length})
              </span>
              <button
                onClick={onOpenPairModal}
                className="px-2.5 py-1 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pasang Baru</span>
              </button>
            </div>

            <div className="space-y-2">
              {devices.map((dev) => {
                const isOnline = dev.status === 'connected';
                return (
                  <div
                    key={dev.id}
                    className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-tile flex items-center justify-center shrink-0">
                        {dev.type === 'desktop' ? (
                          <Laptop className="w-4 h-4 text-text-secondary" />
                        ) : (
                          <Smartphone className="w-4 h-4 text-text-secondary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-text truncate">
                          {dev.name}
                        </div>
                        <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOnline ? 'bg-accent' : 'bg-text-muted'
                            }`}
                          />
                          <span>{isOnline ? 'Terhubung' : 'Terputus'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isOnline && onDisconnectDevice && (
                        <button
                          onClick={() => onDisconnectDevice(dev.id)}
                          className="px-2 py-1 rounded-md text-[11px] text-danger-text hover:bg-danger-bg border border-danger-border transition-colors"
                          title="Putuskan sambungan"
                        >
                          Putuskan
                        </button>
                      )}
                      {onRemoveDevice && (
                        <button
                          onClick={() => onRemoveDevice(dev.id)}
                          className="p-1 rounded-md hover:bg-control-hover text-text-muted hover:text-danger-text transition-colors"
                          title="Hapus perangkat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 4: PENGATURAN */}
        {activeTab === 'pengaturan' && (
          <div className="space-y-4">
            {/* Theme Segmented Control */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-text">Tema Tampilan</div>
                <div className="text-[11px] text-text-muted">
                  Pilih mode gelap, terang, atau ikuti sistem
                </div>
              </div>
              <div className="p-1 rounded-xl bg-control-track border border-control-border flex items-center gap-1">
                {[
                  { key: 'light', label: 'Terang', icon: Sun },
                  { key: 'dark', label: 'Gelap', icon: Moon },
                  { key: 'system', label: 'Sistem', icon: Monitor },
                ].map((m) => {
                  const Icon = m.icon;
                  const isSel = settings.theme === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => onUpdateSetting('theme', m.key as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-all ${
                        isSel
                          ? 'bg-control-selected text-text font-semibold shadow-sm'
                          : 'text-text-muted hover:text-text'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Open Full App Button */}
            <div className="pt-2">
              <button
                onClick={onOpenMainWindow}
                className="w-full py-2.5 rounded-xl bg-control hover:bg-control-hover border border-control-border text-text text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Buka Jendela Utama Lengkap</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PanelExpanded;
