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
    <div className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
            isConnected
              ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 glow-teal'
              : 'bg-slate-800 border-slate-700 text-slate-400'
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
                className="bg-slate-900 border border-teal-500/50 rounded-lg px-2.5 py-1 text-sm font-semibold text-white focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleSaveRename}
                className="p-1 rounded-lg bg-teal-500 text-slate-950 hover:bg-teal-400 transition-colors"
                title="Simpan"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setNameInput(device.name);
                  setIsEditing(false);
                }}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Batal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base text-slate-100 truncate">
                {device.name}
              </h4>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-slate-400 hover:text-teal-400 transition-colors"
                title="Ganti Nama"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-teal-400 shadow-[0_0_8px_#2dd4bf]' : 'bg-slate-500'
                }`}
              />
              <span className={isConnected ? 'text-teal-300 font-semibold' : 'text-slate-400'}>
                {isConnected ? 'Terhubung' : 'Terputus'}
              </span>
            </span>

            {device.ipAddress && (
              <span className="font-mono text-slate-400">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <Unplug className="w-3.5 h-3.5 text-amber-400" />
            <span>Putuskan</span>
          </button>
        )}

        <button
          onClick={() => onRemove(device.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Pasangan</span>
        </button>
      </div>
    </div>
  );
};
