import React, { useState, useRef, useEffect } from 'react';
import { DeviceModel, TransferModel } from '@shared/types';
import { ChatBubble } from '../components/ChatBubble';
import { Send, Paperclip, ChevronDown, Wifi, WifiOff, FileText, X } from 'lucide-react';

interface Props {
  devices: DeviceModel[];
  activeDevice: DeviceModel | null;
  onSelectDevice: (device: DeviceModel) => void;
  transfers: TransferModel[];
  onSendText: (text: string, kind: 'text' | 'link') => Promise<void>;
  onSendFiles: (filePaths: string[]) => Promise<void>;
  onOpenFolder: (path: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenPairModal: () => void;
}

export const KirimPage: React.FC<Props> = ({
  devices,
  activeDevice,
  onSelectDevice,
  transfers,
  onSendText,
  onSendFiles,
  onOpenFolder,
  onRetry,
  onCancel,
  onOpenPairModal,
}) => {
  const [text, setText] = useState('');
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest transfer
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transfers]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (selectedFilePaths.length > 0) {
      await onSendFiles(selectedFilePaths);
      setSelectedFilePaths([]);
      return;
    }

    if (!text.trim()) return;
    const isUrl = /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i.test(text.trim());
    await onSendText(text, isUrl ? 'link' : 'text');
    setText('');
  };

  const handleAttachFiles = async () => {
    try {
      const paths = await (window as any).syncboard?.selectFilesToSend();
      if (paths && paths.length > 0) {
        setSelectedFilePaths((prev) => [...prev, ...paths]);
      }
    } catch (err) {
      console.error('Failed to attach files:', err);
    }
  };

  const removeSelectedFile = (idx: number) => {
    setSelectedFilePaths((prev) => prev.filter((_, i) => i !== idx));
  };

  const isConnected = activeDevice?.status === 'connected';

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Top Bar: Target Device & Connection Status */}
      <div className="px-6 py-3.5 border-b border-white/5 bg-slate-900/40 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="relative">
          <button
            onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
            className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-white/5 transition-colors text-left"
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isConnected
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 glow-teal'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {isConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>

            <div>
              <div className="flex items-center gap-1.5 font-bold text-sm text-slate-100">
                <span>{activeDevice ? activeDevice.name : 'Tidak Ada Perangkat'}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xs text-slate-400">
                {isConnected ? (
                  <span className="text-teal-400 font-medium">Terhubung via Wi-Fi</span>
                ) : (
                  <span>Belum Terhubung</span>
                )}
              </div>
            </div>
          </button>

          {/* Device Selector Dropdown */}
          {isDeviceDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-2 z-40">
              <span className="text-[11px] font-semibold text-slate-400 px-3 py-1.5 uppercase tracking-wider block">
                Pilih Target Perangkat
              </span>
              {devices.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">
                  Belum ada perangkat terpasang.
                </div>
              ) : (
                devices.map((dev) => (
                  <button
                    key={dev.id}
                    onClick={() => {
                      onSelectDevice(dev);
                      setIsDeviceDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                      activeDevice?.id === dev.id
                        ? 'bg-teal-500/15 text-teal-300'
                        : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <span className="truncate">{dev.name}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        dev.status === 'connected' ? 'bg-teal-400' : 'bg-slate-600'
                      }`}
                    />
                  </button>
                ))
              )}

              <div className="mt-1 pt-1 border-t border-white/5">
                <button
                  onClick={() => {
                    setIsDeviceDropdownOpen(false);
                    onOpenPairModal();
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold text-teal-400 hover:bg-teal-500/10 rounded-xl text-left transition-colors"
                >
                  + Pasangkan Perangkat Baru
                </button>
              </div>
            </div>
          )}
        </div>

        {!isConnected && (
          <button
            onClick={onOpenPairModal}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 transition-colors"
          >
            Sambungkan HP
          </button>
        )}
      </div>

      {/* Middle: Chat-style Messages History */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1">
        {transfers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-8">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4">
              <Send className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-300 mb-1">
              Mulai Sinkronisasi Lokal
            </h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Ketik pesan teks, tempel tautan, atau seret berkas apa saja ke jendela ini untuk langsung mengirimkannya ke ponsel.
            </p>
          </div>
        ) : (
          transfers.map((item) => (
            <ChatBubble
              key={item.id}
              transfer={item}
              onRetry={onRetry}
              onCancel={onCancel}
              onOpenFolder={onOpenFolder}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selected Attachments Preview */}
      {selectedFilePaths.length > 0 && (
        <div className="px-6 py-2 bg-slate-900/60 border-t border-white/5 flex flex-wrap gap-2">
          {selectedFilePaths.map((p, idx) => {
            const name = p.replace(/^.*[\\/]/, '');
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono bg-teal-500/10 text-teal-300 border border-teal-500/20"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="max-w-[200px] truncate">{name}</span>
                <button
                  onClick={() => removeSelectedFile(idx)}
                  className="hover:text-rose-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Bottom: Input Box, Attach & Send Button */}
      <div className="p-4 bg-slate-900/80 border-t border-white/10 shrink-0">
        <div className="flex items-end gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-2.5 focus-within:border-teal-500/50 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
          <button
            onClick={handleAttachFiles}
            className="p-2 rounded-xl text-slate-400 hover:text-teal-400 hover:bg-white/5 transition-colors shrink-0"
            title="Lampirkan Berkas"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik teks pesan atau tempel tautan di sini... (Ctrl+Enter untuk kirim)"
            rows={2}
            className="flex-1 bg-transparent border-0 text-slate-100 placeholder-slate-500 text-sm focus:outline-none resize-none py-1.5 font-sans leading-relaxed"
          />

          <button
            onClick={handleSend}
            disabled={!text.trim() && selectedFilePaths.length === 0}
            className="p-2.5 rounded-xl bg-teal-500 text-slate-950 hover:bg-teal-400 font-bold disabled:opacity-40 disabled:hover:bg-teal-500 transition-all shrink-0 shadow-lg shadow-teal-500/20"
            title="Kirim (Ctrl+Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-between items-center px-2 pt-2 text-[11px] text-slate-500 font-medium">
          <span>Tekan <strong>Ctrl+Enter</strong> untuk mengirim langsung</span>
          <span>{text.length} karakter</span>
        </div>
      </div>
    </div>
  );
};
