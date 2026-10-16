import React, { useState } from 'react';
import { TransferModel } from '@shared/types';
import { TransferStatusChip } from '../components/TransferStatusChip';
import {
  Search,
  Pin,
  Trash2,
  Copy,
  Check,
  FolderOpen,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  CheckSquare,
  Square,
  Inbox,
  Send,
} from 'lucide-react';

interface Props {
  transfers: TransferModel[];
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: number) => void;
  onOpenFolder: (path: string) => void;
  onClearAll: () => void;
}

export const RiwayatPage: React.FC<Props> = ({
  transfers,
  onDelete,
  onPin,
  onOpenFolder,
  onClearAll,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filters = [
    { id: 'all', label: 'Semua' },
    { id: 'text', label: 'Teks' },
    { id: 'link', label: 'Tautan' },
    { id: 'photo', label: 'Foto' },
    { id: 'file', label: 'File' },
    { id: 'pinned', label: 'Disematkan' },
  ];

  const filteredTransfers = transfers.filter((item) => {
    // Filter by type
    if (filter === 'pinned' && !item.pinned) return false;
    if (filter === 'text' && item.kind !== 'text') return false;
    if (filter === 'link' && item.kind !== 'link') return false;
    if (filter === 'photo' && item.kind !== 'photo') return false;
    if (filter === 'file' && item.kind !== 'file') return false;

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const body = (item.textBody || '').toLowerCase();
      const name = (item.fileName || '').toLowerCase();
      const dev = (item.deviceName || '').toLowerCase();
      return body.includes(q) || name.includes(q) || dev.includes(q);
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (confirm(`Hapus ${selectedIds.length} item dari riwayat?`)) {
      selectedIds.forEach((id) => onDelete(id));
      setSelectedIds([]);
      setSelectionMode(false);
    }
  };

  const handleBulkPin = () => {
    selectedIds.forEach((id) => onPin(id, 1));
    setSelectedIds([]);
    setSelectionMode(false);
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await (window as any).syncboard?.copyToClipboard(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
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

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 overflow-y-auto">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Riwayat Transfer</h2>
          <p className="text-xs text-slate-400 mt-1">
            Telusuri dan kelola data yang pernah dikirim dan diterima
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <button
                onClick={handleBulkPin}
                disabled={selectedIds.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 disabled:opacity-40 transition-colors"
              >
                <Pin className="w-3.5 h-3.5" />
                <span>Sematkan ({selectedIds.length})</span>
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus ({selectedIds.length})</span>
              </button>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds([]);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectionMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Mode Pilih</span>
              </button>
              <button
                onClick={onClearAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Semua</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filter === f.id
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/40 shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari teks atau file..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500/50"
          />
        </div>
      </div>

      {/* List */}
      {filteredTransfers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-slate-500">
          <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-slate-300 mb-1">
            Tidak Ada Riwayat Ditemukan
          </h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Riwayat pesan dan transfer berkas Anda akan muncul di sini.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransfers.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const isFile = item.kind === 'file' || item.kind === 'photo';

            return (
              <div
                key={item.id}
                className={`glass-panel glass-panel-hover rounded-2xl p-4 flex items-center justify-between gap-4 transition-all ${
                  item.pinned ? 'border-teal-500/30 bg-teal-950/10' : ''
                } ${isSelected ? 'ring-2 ring-teal-500/60' : ''}`}
              >
                {selectionMode && (
                  <button
                    onClick={() => toggleSelect(item.id)}
                    className="p-1 text-slate-400 hover:text-teal-400"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-teal-400" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                )}

                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      item.direction === 'incoming'
                        ? 'bg-teal-500/10 border-teal-500/20 text-teal-400'
                        : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                    }`}
                  >
                    {item.direction === 'incoming' ? (
                      <Inbox className="w-5 h-5" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-slate-300">
                        {item.deviceName || 'Ponsel'}
                      </span>
                      <TransferStatusChip status={item.status} size="sm" />
                      <span className="text-[11px] text-slate-500">{formatDate(item.createdAt)}</span>
                      {item.pinned ? (
                        <span className="text-[11px] font-semibold text-teal-400 flex items-center gap-1">
                          <Pin className="w-3 h-3 fill-teal-400" />
                          <span>Disematkan</span>
                        </span>
                      ) : null}
                    </div>

                    {isFile ? (
                      <div className="flex items-center gap-2 text-sm font-mono text-slate-100 truncate">
                        {item.kind === 'photo' ? (
                          <ImageIcon className="w-4 h-4 text-teal-400 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                        )}
                        <span className="truncate">{item.fileName}</span>
                        <span className="text-xs text-slate-400 font-sans">
                          ({formatBytes(item.fileSize)})
                        </span>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-200 line-clamp-1 font-sans">
                        {item.textBody}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {!isFile && item.textBody && (
                    <button
                      onClick={() => handleCopy(item.id, item.textBody!)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                      title="Salin Teks"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-4 h-4 text-teal-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {isFile && item.savedPath && item.status === 'Selesai' && (
                    <button
                      onClick={() => onOpenFolder(item.savedPath!)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                      title="Buka Folder"
                    >
                      <FolderOpen className="w-4 h-4 text-teal-400" />
                    </button>
                  )}

                  <button
                    onClick={() => onPin(item.id, item.pinned ? 0 : 1)}
                    className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${
                      item.pinned ? 'text-teal-400' : 'text-slate-400'
                    }`}
                    title={item.pinned ? 'Lepas Sematan' : 'Sematkan'}
                  >
                    <Pin className={`w-4 h-4 ${item.pinned ? 'fill-teal-400' : ''}`} />
                  </button>

                  <button
                    onClick={() => onDelete(item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Hapus"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
