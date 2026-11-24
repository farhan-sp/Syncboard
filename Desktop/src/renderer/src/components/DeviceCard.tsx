import React, { useState } from 'react';
import { DeviceModel } from '@shared/types';
import { Smartphone, Edit3, Unplug, Trash2, Check, X } from 'lucide-react';

interface Props {
  device: DeviceModel;
  onRename: (id: string, newName: string) => void;
  onDisconnect: (id: string) => void;
  onRemove: (id: string) => void;
}

export const DeviceCard: React.FC<Props> = ({
  device,
  onRename,
  onDisconnect,
  onRemove,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);

  const isConnected = device.status === 'connected';

  const handleSaveRename = () => {
    if (nameInput.trim() && nameInput.trim() !== device.name) {
      onRename(device.id, nameInput.trim());
    }
    setIsEditing(false);
  };

  const formatDate = (ts: number) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-text">
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
            isConnected
              ? 'bg-tile border-border text-accent'
              : 'bg-surface-inset border-border text-icon-muted'
          }`}
        >
          <Smartphone className="w-6 h-6" />
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="bg-surface-inset border border-border rounded-lg px-2.5 py-1 text-sm font-semibold text-text focus:outline-none focus:ring-2 focus:ring-accent"
                autoFocus
              />
              <button
                onClick={handleSaveRename}
                className="p-1 rounded-lg bg-accent text-on-accent hover:bg-accent-hover transition-colors"
                title="Simpan"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setNameInput(device.name);
                  setIsEditing(false);
                }}
                className="p-1 rounded-lg bg-control text-text-muted hover:text-text border border-control-border transition-colors"
                title="Batal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base text-text truncate">
                {device.name}
              </h4>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-text-muted hover:text-accent transition-colors"
                title="Ganti Nama"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-text-muted">
            <span className="flex items-center gap-1.5 font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-accent' : 'bg-icon-muted'
                }`}
              />
              <span className={isConnected ? 'text-accent font-semibold' : 'text-text-muted'}>
                {isConnected ? 'Terhubung' : 'Terputus'}
              </span>
            </span>

            {device.ipAddress && (
              <span className="font-mono text-text-muted">
                IP: {device.ipAddress}
              </span>
            )}

            <span>Terakhir terlihat: {formatDate(device.lastSeenAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        {isConnected && (
          <button
            onClick={() => onDisconnect(device.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-danger-bg hover:opacity-90 active:opacity-80 text-danger-text border border-danger-border transition-colors"
          >
            <Unplug className="w-3.5 h-3.5" />
            <span>Putuskan</span>
          </button>
        )}

        <button
          onClick={() => onRemove(device.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-danger-bg hover:opacity-90 active:opacity-80 text-danger-text border border-danger-border transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Pasangan</span>
        </button>
      </div>
    </div>
  );
};
