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
    <div className="flex flex-col h-full bg-chat-bg p-6 overflow-y-auto">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-text">Riwayat Transfer</h2>
          <p className="text-xs text-text-muted mt-1">
            Telusuri dan kelola data yang pernah dikirim dan diterima
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <button
                onClick={handleBulkPin}
                disabled={selectedIds.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-control border border-control-border text-accent hover:bg-control-hover active:bg-control-pressed disabled:opacity-45 transition-colors"
              >
                <Pin className="w-3.5 h-3.5" />
                <span>Sematkan ({selectedIds.length})</span>
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedIds.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-danger-bg text-danger-text border border-danger-border hover:opacity-90 active:opacity-80 disabled:opacity-45 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus ({selectedIds.length})</span>
              </button>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds([]);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-control border border-control-border text-text-secondary hover:bg-control-hover transition-colors"
              >
                Batal
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectionMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-control hover:bg-control-hover active:bg-control-pressed text-text-secondary border border-control-border transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Mode Pilih</span>
              </button>
              <button
                onClick={onClearAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-danger-bg hover:opacity-90 active:opacity-80 text-danger-text border border-danger-border transition-colors"
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
                  ? 'bg-accent text-on-accent border border-accent shadow-sm'
                  : 'bg-surface text-text-secondary hover:bg-control-hover hover:text-text border border-chip-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari teks atau file..."
            className="w-full bg-surface-inset border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-text placeholder-text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />
        </div>
      </div>

      {/* List */}
      {filteredTransfers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 text-text-muted">
          <div className="w-16 h-16 rounded-3xl bg-surface border border-border flex items-center justify-center text-text-muted mb-4">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-text mb-1">
            Tidak Ada Riwayat Ditemukan
          </h3>
          <p className="text-xs text-text-muted max-w-sm">
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
                className={`bg-surface border border-border rounded-2xl p-4 flex items-center justify-between gap-4 transition-all hover:border-chip-border ${
                  item.pinned ? 'border-accent/40 bg-accent-selected-bg/30' : ''
                } ${isSelected ? 'bg-accent-selected-bg ring-2 ring-accent' : ''}`}
              >
                {selectionMode && (
                  <button
                    onClick={() => toggleSelect(item.id)}
                    className="p-1 text-text-muted hover:text-accent transition-colors"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-accent" />
                    ) : (
                      <Square className="w-5 h-5 text-icon-muted" />
                    )}
                  </button>
                )}

                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border bg-tile text-accent">
                    {item.direction === 'incoming' ? (
                      <Inbox className="w-5 h-5" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-text-secondary">
                        {item.deviceName || 'Ponsel'}
                      </span>
                      <TransferStatusChip status={item.status} size="sm" />
                      <span className="text-[11px] text-text-muted">{formatDate(item.createdAt)}</span>
                      {item.pinned ? (
                        <span className="text-[11px] font-semibold text-accent flex items-center gap-1">
                          <Pin className="w-3 h-3 fill-accent text-accent" />
                          <span>Disematkan</span>
                        </span>
                      ) : null}
                    </div>

                    {isFile ? (
                      <div className="flex items-center gap-2 text-sm font-mono text-text truncate">
                        {item.kind === 'photo' ? (
                          <ImageIcon className="w-4 h-4 text-accent shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-accent shrink-0" />
                        )}
                        <span className="truncate">{item.fileName}</span>
                        <span className="text-xs text-text-muted font-sans">
                          ({formatBytes(item.fileSize)})
                        </span>
                      </div>
                    ) : item.kind === 'link' ? (
                      <div className="flex items-center gap-2 text-sm text-accent-text line-clamp-1 font-sans">
                        <LinkIcon className="w-4 h-4 text-accent-text shrink-0" />
                        <span className="truncate">{item.textBody}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-text line-clamp-1 font-sans">
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
                      className="p-1.5 rounded-lg bg-control border border-control-border hover:bg-control-hover active:bg-control-pressed text-text-secondary transition-colors"
                      title="Salin Teks"
                    >
                      {copiedId === item.id ? (
                        <Check className="w-4 h-4 text-accent" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {isFile && item.savedPath && item.status === 'Selesai' && (
                    <button
                      onClick={() => onOpenFolder(item.savedPath!)}
                      className="p-1.5 rounded-lg bg-control border border-control-border hover:bg-control-hover active:bg-control-pressed text-text-secondary transition-colors"
                      title="Buka Folder"
                    >
                      <FolderOpen className="w-4 h-4 text-accent" />
                    </button>
                  )}

                  <button
                    onClick={() => onPin(item.id, item.pinned ? 0 : 1)}
                    className={`p-1.5 rounded-lg hover:bg-control-hover transition-colors ${
                      item.pinned ? 'text-accent' : 'text-icon-muted'
                    }`}
                    title={item.pinned ? 'Lepas Sematan' : 'Sematkan'}
                  >
                    <Pin className={`w-4 h-4 ${item.pinned ? 'fill-accent text-accent' : ''}`} />
                  </button>

                  <button
                    onClick={() => onDelete(item.id)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-danger-text hover:bg-danger-bg transition-colors"
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
