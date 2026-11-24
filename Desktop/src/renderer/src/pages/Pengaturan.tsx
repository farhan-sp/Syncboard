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
    <div className="flex flex-col h-full bg-chat-bg p-6 overflow-y-auto space-y-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-text">Pengaturan Aplikasi</h2>
        <p className="text-xs text-text-muted mt-1">
          Konfigurasi penyimpanan berkas, privasi, dan tampilan antarmuka
        </p>
      </div>

      {/* 1. File Storage Settings */}
      <div className="bg-surface border border-border rounded-3xl p-6 space-y-5 text-text">
        <h3 className="text-sm font-bold text-accent uppercase tracking-wider flex items-center gap-2">
          <Folder className="w-4 h-4" />
          <span>Penyimpanan Berkas</span>
        </h3>

        {/* Download Folder Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-surface-inset border border-border">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-text block">
              Folder Unduhan SyncBoard
            </span>
            <span className="text-xs text-text-muted block font-mono truncate mt-0.5">
              {settings.downloadDir || '~/Downloads/SyncBoard'}
            </span>
          </div>
          <button
            onClick={onSelectDownloadDir}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-control hover:bg-control-hover active:bg-control-pressed text-text-secondary border border-control-border transition-colors shrink-0 self-start sm:self-auto"
          >
            Ubah Folder
          </button>
        </div>

        {/* Confirm Before Receive Toggle */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface-inset border border-border">
          <div>
            <span className="text-sm font-semibold text-text block">
              Konfirmasi Penerimaan Berkas
            </span>
            <span className="text-xs text-text-muted block mt-0.5">
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
            <div className="w-11 h-6 rounded-full border border-toggle-off-border bg-transparent peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-checked:bg-accent peer-checked:border-accent transition-all peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-toggle-off-knob peer-checked:after:bg-toggle-on-knob after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
      </div>

      {/* 2. History & Privacy Mode */}
      <div className="bg-surface border border-border rounded-3xl p-6 space-y-5 text-text">
        <h3 className="text-sm font-bold text-accent uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4" />
          <span>Mode Riwayat & Privasi</span>
        </h3>

        {/* Radio Cards for Simpan vs Kirim Sekali */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => onUpdateSetting('historyMode', 'simpan')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              settings.historyMode === 'simpan'
                ? 'border-2 border-accent bg-accent-selected-bg ring-1 ring-accent'
                : 'bg-surface border border-chip-border hover:border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-text">
                Mode Simpan (Permanen)
              </span>
              {settings.historyMode === 'simpan' && (
                <CheckCircle2 className="w-4 h-4 text-accent" />
              )}
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Semua teks dan catatan transfer disimpan terus di komputer ini sampai Anda menghapusnya secara manual.
            </p>
          </button>

          <button
            onClick={() => onUpdateSetting('historyMode', 'kirim_sekali')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              settings.historyMode === 'kirim_sekali'
                ? 'border-2 border-accent bg-accent-selected-bg ring-1 ring-accent'
                : 'bg-surface border border-chip-border hover:border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-text">
                Mode Kirim Sekali (Ephemeral)
              </span>
              {settings.historyMode === 'kirim_sekali' && (
                <CheckCircle2 className="w-4 h-4 text-accent" />
              )}
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Teks dan riwayat transfer dihapus secara otomatis dari komputer ini setelah masa retensi berakhir.
            </p>
          </button>
        </div>

        {/* Retention Duration Selector if Kirim Sekali */}
        {settings.historyMode === 'kirim_sekali' && (
          <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-inset border border-border">
            <div>
              <span className="text-sm font-semibold text-text block">
                Masa Retensi Mode Kirim Sekali
              </span>
              <span className="text-xs text-text-muted block mt-0.5">
                Lama waktu riwayat tersimpan sebelum dihapus otomatis
              </span>
            </div>
            <select
              value={settings.retentionHours}
              onChange={(e) => onUpdateSetting('retentionHours', parseInt(e.target.value, 10))}
              className="bg-surface border border-border rounded-xl px-3 py-1.5 text-xs font-semibold text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
        <div className="p-4 rounded-2xl bg-surface-inset border border-border flex items-start gap-3 text-xs text-text-muted">
          <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-text">Penjelasan Batasan Penghapusan:</strong> Menghapus riwayat transfer hanya berlaku untuk catatan di aplikasi komputer ini. Berkas yang sudah tersimpan di folder disk tidak akan pernah dihapus secara otomatis demi keamanan data Anda.
          </p>
        </div>

        {/* Clear All History Button */}
        <div className="pt-2">
          <button
            onClick={onClearAllHistory}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-danger-bg hover:opacity-90 active:opacity-80 text-danger-text border border-danger-border transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Hapus Semua Riwayat Transfer</span>
          </button>
        </div>
      </div>

      {/* 3. Theme & System */}
      <div className="bg-surface border border-border rounded-3xl p-6 space-y-5 text-text">
        <h3 className="text-sm font-bold text-accent uppercase tracking-wider flex items-center gap-2">
          <Moon className="w-4 h-4" />
          <span>Tema & Sistem</span>
        </h3>

        {/* Theme Selector */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-inset border border-border">
          <div>
            <span className="text-sm font-semibold text-text block">
              Tema Tampilan
            </span>
            <span className="text-xs text-text-muted block mt-0.5">
              Pilih mode gelap atau sesuaikan dengan sistem operasi
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-control-track p-1 rounded-xl border border-border">
            <button
              onClick={() => onUpdateSetting('theme', 'dark')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
                settings.theme === 'dark'
                  ? 'bg-control-selected text-control-selected-text shadow-control-selected font-semibold'
                  : 'text-text-secondary hover:text-text'
              }`}
              title="Gelap"
            >
              <Moon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateSetting('theme', 'light')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
                settings.theme === 'light'
                  ? 'bg-control-selected text-control-selected-text shadow-control-selected font-semibold'
                  : 'text-text-secondary hover:text-text'
              }`}
              title="Terang"
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              onClick={() => onUpdateSetting('theme', 'system')}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all ${
                settings.theme === 'system'
                  ? 'bg-control-selected text-control-selected-text shadow-control-selected font-semibold'
                  : 'text-text-secondary hover:text-text'
              }`}
              title="Sistem"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tampilkan island */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface-inset border border-border">
          <div>
            <span className="text-sm font-semibold text-text block">
              Tampilkan island
            </span>
            <span className="text-xs text-text-muted block mt-0.5">
              Tampilkan pil ringkas di bagian tengah atas layar untuk jalan pintas cepat
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.islandEnabled ?? true}
              onChange={(e) => onUpdateSetting('islandEnabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 rounded-full border border-toggle-off-border bg-transparent peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-checked:bg-accent peer-checked:border-accent transition-all peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-toggle-off-knob peer-checked:after:bg-toggle-on-knob after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        {/* Start with System */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface-inset border border-border">
          <div>
            <span className="text-sm font-semibold text-text block">
              Jalankan Otomatis saat Komputer Menyala
            </span>
            <span className="text-xs text-text-muted block mt-0.5">
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
            <div className="w-11 h-6 rounded-full border border-toggle-off-border bg-transparent peer-focus:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-checked:bg-accent peer-checked:border-accent transition-all peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-toggle-off-knob peer-checked:after:bg-toggle-on-knob after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
      </div>

      {/* 4. About & Version */}
      <div className="p-4 rounded-2xl border border-border bg-surface text-center text-xs text-text-muted space-y-1">
        <p className="font-semibold text-text">SyncBoard Desktop v1.0.0</p>
        <p>Transfer data lokal peer-to-peer tanpa internet, cloud, atau akun.</p>
      </div>
    </div>
  );
};
