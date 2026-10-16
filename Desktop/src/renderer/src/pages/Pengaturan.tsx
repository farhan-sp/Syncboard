import React from 'react';
import { AppSettings } from '@shared/types';
import { RETENTION_OPTIONS } from '@shared/constants';
import {
  Folder,
  Shield,
  Trash2,
  Moon,
  Sun,
  Monitor,
  Info,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface Props {
  settings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onSelectDownloadDir: () => void;
  onClearAllHistory: () => void;
}

export const PengaturanPage: React.FC<Props> = ({
  settings,
  onUpdateSetting,
  onSelectDownloadDir,
  onClearAllHistory,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 overflow-y-auto space-y-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">Pengaturan Aplikasi</h2>
        <p className="text-xs text-slate-400 mt-1">
          Konfigurasi penyimpanan berkas, privasi, dan tampilan antarmuka
        </p>
      </div>

      {/* 1. File Storage Settings */}
      <div className="glass-panel rounded-3xl p-6 space-y-5">
        <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
          <Folder className="w-4 h-4" />
          <span>Penyimpanan Berkas</span>
        </h3>

        {/* Download Folder Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950/60 border border-white/5">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-slate-200 block">
              Folder Unduhan SyncBoard
            </span>
            <span className="text-xs text-slate-400 block font-mono truncate mt-0.5">
              {settings.downloadDir || '~/Downloads/SyncBoard'}
            </span>
          </div>
          <button
            onClick={onSelectDownloadDir}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shrink-0 self-start sm:self-auto"
          >
            Ubah Folder
          </button>
        </div>

        {/* Confirm Before Receive Toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950/60 border border-white/5">
          <div>
            <span className="text-sm font-semibold text-slate-200 block">
              Konfirmasi Penerimaan Berkas
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">
              Tampilkan dialog "Terima" / "Tolak" sebelum berkas dari ponsel disimpan ke komputer
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.confirmBeforeReceive}
              onChange={(e) => onUpdateSetting('confirmBeforeReceive', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
          </label>
        </div>
      </div>

      {/* 2. History & Privacy Mode */}
      <div className="glass-panel rounded-3xl p-6 space-y-5">
        <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4" />
          <span>Mode Riwayat & Privasi</span>
        </h3>

        {/* Radio Cards for Simpan vs Kirim Sekali */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => onUpdateSetting('historyMode', 'simpan')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              settings.historyMode === 'simpan'
                ? 'bg-teal-500/10 border-teal-500/50 ring-1 ring-teal-500/50'
                : 'bg-slate-950/60 border-white/5 hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-slate-100">
                Mode Simpan (Permanen)
              </span>
              {settings.historyMode === 'simpan' && (
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Semua teks dan catatan transfer disimpan terus di komputer ini sampai Anda menghapusnya secara manual.
            </p>
          </button>

          <button
            onClick={() => onUpdateSetting('historyMode', 'kirim_sekali')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              settings.historyMode === 'kirim_sekali'
                ? 'bg-teal-500/10 border-teal-500/50 ring-1 ring-teal-500/50'
                : 'bg-slate-950/60 border-white/5 hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-slate-100">
                Mode Kirim Sekali (Ephemeral)
              </span>
              {settings.historyMode === 'kirim_sekali' && (
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Teks dan riwayat transfer dihapus secara otomatis dari komputer ini setelah masa retensi berakhir.
            </p>
          </button>
        </div>

        {/* Retention Duration Selector if Kirim Sekali */}
        {settings.historyMode === 'kirim_sekali' && (
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/60 border border-white/5">
            <div>
              <span className="text-sm font-semibold text-slate-200 block">
                Masa Retensi Mode Kirim Sekali
              </span>
              <span className="text-xs text-slate-400 block mt-0.5">
                Lama waktu riwayat tersimpan sebelum dihapus otomatis
              </span>
            </div>
            <select
              value={settings.retentionHours}
              onChange={(e) => onUpdateSetting('retentionHours', parseInt(e.target.value, 10))}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-teal-500"
            >
              {RETENTION_OPTIONS.map((opt) => (
                <option key={opt.hours} value={opt.hours}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Clear Explanation in Indonesian */}
        <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-start gap-3 text-xs text-teal-200">
          <Info className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Penjelasan Batasan Penghapusan:</strong> Menghapus riwayat transfer hanya berlaku untuk catatan di aplikasi komputer ini. Berkas yang sudah tersimpan di folder disk tidak akan pernah dihapus secara otomatis demi keamanan data Anda.
          </p>
        </div>

        {/* Clear All History Button */}
        <div className="pt-2">
          <button
            onClick={onClearAllHistory}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Hapus Semua Riwayat Transfer</span>
          </button>
        </div>
      </div>

      {/* 3. Theme & System */}
      <div className="glass-panel rounded-3xl p-6 space-y-5">
        <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
          <Moon className="w-4 h-4" />
          <span>Tema & Sistem</span>
        </h3>

        {/* Theme Selector */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/60 border border-white/5">
          <div>
            <span className="text-sm font-semibold text-slate-200 block">
              Tema Tampilan
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">
              Pilih mode gelap atau sesuaikan dengan sistem operasi
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => onUpdateSetting('theme', 'dark')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                settings.theme === 'dark'
                  ? 'bg-teal-500/20 text-teal-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Gelap"
            >
              <Moon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateSetting('theme', 'light')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                settings.theme === 'light'
                  ? 'bg-teal-500/20 text-teal-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Terang"
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateSetting('theme', 'system')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                settings.theme === 'system'
                  ? 'bg-teal-500/20 text-teal-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Sistem"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Start with System */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950/60 border border-white/5">
          <div>
            <span className="text-sm font-semibold text-slate-200 block">
              Jalankan Otomatis saat Komputer Menyala
            </span>
            <span className="text-xs text-slate-400 block mt-0.5">
              SyncBoard akan otomatis aktif di baki sistem (system tray) saat login
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.startWithSystem}
              onChange={(e) => onUpdateSetting('startWithSystem', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
          </label>
        </div>
      </div>

      {/* 4. About & Version */}
      <div className="p-4 rounded-2xl border border-white/5 bg-slate-900/40 text-center text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-400">SyncBoard Desktop v1.0.0</p>
        <p>Transfer data lokal peer-to-peer tanpa internet, cloud, atau akun.</p>
      </div>
    </div>
  );
};
