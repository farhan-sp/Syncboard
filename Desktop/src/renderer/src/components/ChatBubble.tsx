import React, { useState } from 'react';
import { TransferModel } from '@shared/types';
import { TransferStatusChip } from './TransferStatusChip';
import { Copy, Check, FolderOpen, RotateCcw, X, FileText, ExternalLink, HardDrive } from 'lucide-react';

interface Props {
  transfer: TransferModel;
  onRetry?: (id: string) => void;
  onCancel?: (id: string) => void;
  onOpenFolder?: (path: string) => void;
}

export const ChatBubble: React.FC<Props> = ({
  transfer,
  onRetry,
  onCancel,
  onOpenFolder,
}) => {
  const [copied, setCopied] = useState(false);
  const isOutgoing = transfer.direction === 'outgoing';
  const isFile = transfer.kind === 'file' || transfer.kind === 'photo';

  const handleCopy = async () => {
    if (!transfer.textBody) return;
    try {
      await (window as any).syncboard?.copyToClipboard(transfer.textBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`flex flex-col my-2 ${isOutgoing ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="text-xs font-medium text-slate-400">
          {isOutgoing ? 'Komputer Ini' : transfer.deviceName || 'Ponsel'}
        </span>
        <span className="text-[11px] text-slate-500">{formatTime(transfer.createdAt)}</span>
        <TransferStatusChip status={transfer.status} size="sm" />
      </div>

      <div
        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 shadow-lg border ${
          isOutgoing
            ? 'bg-gradient-to-br from-blue-950/80 to-slate-900/90 border-blue-500/20 text-blue-50'
            : 'bg-gradient-to-br from-teal-950/80 to-slate-900/90 border-teal-500/20 text-teal-50'
        }`}
      >
        {/* Text or Link */}
        {!isFile && (
          <div>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed select-text font-sans">
              {transfer.textBody}
            </div>
            {transfer.kind === 'link' && (
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5 text-xs text-teal-400">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Tautan Web</span>
              </div>
            )}
          </div>
        )}

        {/* File Card */}
        {isFile && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-teal-400">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm text-slate-100 truncate font-mono">
                  {transfer.fileName || 'Berkas'}
                </div>
                <div className="text-xs text-slate-400">
                  {formatBytes(transfer.fileSize)}
                </div>
              </div>
            </div>

            {/* Transfer Progress bar if in progress */}
            {transfer.status === 'Mengirim' && (
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-400 to-blue-400 transition-all duration-300"
                    style={{
                      width: `${
                        transfer.fileSize && transfer.bytesTransferred
                          ? Math.min(100, Math.round((transfer.bytesTransferred / transfer.fileSize) * 100))
                          : 40
                      }%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>
                    {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.fileSize)}
                  </span>
                  <span>{transfer.speedBps ? `${formatBytes(transfer.speedBps)}/s` : ''}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions per item */}
        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-2 justify-end">
          {/* Copy button for text */}
          {!isFile && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-teal-400 font-medium">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin</span>
                </>
              )}
            </button>
          )}

          {/* Open folder button for saved files */}
          {isFile && transfer.savedPath && transfer.status === 'Selesai' && (
            <button
              onClick={() => onOpenFolder && onOpenFolder(transfer.savedPath!)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-200 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
              <span>Buka Folder</span>
            </button>
          )}

          {/* Retry button for failed or cancelled */}
          {(transfer.status === 'Gagal' || transfer.status === 'Dibatalkan') && (
            <button
              onClick={() => onRetry && onRetry(transfer.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Coba Lagi</span>
            </button>
          )}

          {/* Cancel button if currently sending */}
          {transfer.status === 'Mengirim' && (
            <button
              onClick={() => onCancel && onCancel(transfer.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Batal</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
