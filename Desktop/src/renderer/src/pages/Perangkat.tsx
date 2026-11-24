import React, { useState, useEffect } from 'react';
import { DeviceModel, NetworkInfo } from '@shared/types';
import { DeviceCard } from '../components/DeviceCard';
import {
  Shield,
  Plus,
  Wifi,
  Copy,
  Check,
  AlertTriangle,
  Terminal,
  HelpCircle,
  Server,
} from 'lucide-react';

interface Props {
  devices: DeviceModel[];
  networkInfo: NetworkInfo | null;
  onRenameDevice: (id: string, newName: string) => void;
  onDisconnectDevice: (id: string) => void;
  onRemoveDevice: (id: string) => void;
  onOpenPairModal: () => void;
}

export const PerangkatPage: React.FC<Props> = ({
  devices,
  networkInfo,
  onRenameDevice,
  onDisconnectDevice,
  onRemoveDevice,
  onOpenPairModal,
}) => {
  const [copiedFp, setCopiedFp] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [troubleshooting, setTroubleshooting] = useState<{
    os: string;
    firewallCmd: string;
    tips: string[];
  } | null>(null);

  useEffect(() => {
    (window as any).syncboard?.getTroubleshootingHelp?.().then((data: any) => {
      if (data) setTroubleshooting(data);
    });
  }, []);

  const handleCopyFp = async () => {
    if (!networkInfo?.certFingerprint) return;
    await (window as any).syncboard?.copyToClipboard(networkInfo.certFingerprint);
    setCopiedFp(true);
    setTimeout(() => setCopiedFp(false), 2000);
  };

  const handleCopyCmd = async () => {
    if (!troubleshooting?.firewallCmd) return;
    await (window as any).syncboard?.copyToClipboard(troubleshooting.firewallCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const isLinux = troubleshooting?.os === 'linux';

  return (
    <div className="flex flex-col h-full bg-chat-bg p-6 overflow-y-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text">Perangkat & Jaringan</h2>
          <p className="text-xs text-text-muted mt-1">
            Kelola ponsel tepercaya dan status server TLS lokal komputer ini
          </p>
        </div>

        <button
          onClick={onOpenPairModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover active:bg-accent-pressed text-on-accent shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Pasangkan Perangkat Baru</span>
        </button>
      </div>

      {/* Network & TLS Server Info Card */}
      <div className="bg-surface rounded-3xl p-6 relative overflow-hidden border border-border text-text">
        <div className="flex items-center gap-2.5 text-accent font-bold text-sm mb-4">
          <Server className="w-5 h-5" />
          <span>Host Server SyncBoard TLS</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface-inset border border-border rounded-2xl p-3.5">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
              NAMA PERANGKAT
            </span>
            <span className="text-sm font-bold text-text block mt-0.5 truncate">
              {networkInfo?.deviceName || 'SyncBoard Desktop'}
            </span>
          </div>

          <div className="bg-surface-inset border border-border rounded-2xl p-3.5">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
              PORT TLS WSS
            </span>
            <span className="text-sm font-bold font-mono text-accent block mt-0.5">
              {networkInfo?.serverPort || 48620}
            </span>
          </div>

          <div className="bg-surface-inset border border-border rounded-2xl p-3.5 sm:col-span-2">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
              ALAMAT IP LOKAL (HOSTS)
            </span>
            <span className="text-xs font-mono text-text block mt-0.5 truncate">
              {networkInfo?.hosts && networkInfo.hosts.length > 0
                ? networkInfo.hosts.join(', ')
                : 'Mencari jaringan Wi-Fi...'}
            </span>
          </div>
        </div>

        {/* Certificate Fingerprint */}
        <div className="mt-4 pt-4 border-t border-divider flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">
              FINGERPRINT SERTIFIKAT (SHA-256 PINNING)
            </span>
            <span className="text-xs font-mono text-accent block truncate mt-0.5">
              {networkInfo?.certFingerprint || 'Memuat fingerprint...'}
            </span>
          </div>

          <button
            onClick={handleCopyFp}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-control hover:bg-control-hover active:bg-control-pressed text-text border border-control-border transition-colors shrink-0"
          >
            {copiedFp ? (
              <>
                <Check className="w-3.5 h-3.5 text-accent" />
                <span className="text-accent">Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Fingerprint</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Trusted Devices Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text">
            Daftar Perangkat Tepercaya ({devices.length})
          </h3>
        </div>

        {devices.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center text-text-muted">
            <p className="text-sm">Belum ada ponsel yang terpasang.</p>
            <p className="text-xs text-text-muted mt-1">
              Klik <strong>"Pasangkan Perangkat Baru"</strong> untuk memindai kode QR dari aplikasi SyncBoard Android.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onRename={onRenameDevice}
                onDisconnect={onDisconnectDevice}
                onRemove={onRemoveDevice}
              />
            ))}
          </div>
        )}
      </div>

      {/* Troubleshooting Help Section */}
      <div className="bg-surface rounded-3xl p-6 border border-border space-y-4 text-text">
        <div className="flex items-center gap-2 text-text font-bold text-sm">
          <HelpCircle className="w-5 h-5 text-accent" />
          <span>Bantuan Pemecahan Masalah Koneksi Wi-Fi</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-text">
          <div className="bg-surface-inset p-4 rounded-2xl border border-border space-y-1.5">
            <strong className="text-text block font-semibold text-sm">
              1. Jaringan Wi-Fi Sama
            </strong>
            <p className="text-text-muted leading-relaxed">
              Pastikan ponsel Android dan komputer terhubung ke router Wi-Fi yang sama (bukan hotspot seluler terpisah).
            </p>
          </div>

          <div className="bg-surface-inset p-4 rounded-2xl border border-border space-y-1.5">
            <strong className="text-text block font-semibold text-sm">
              2. AP Isolation (Client Isolation)
            </strong>
            <p className="text-text-muted leading-relaxed">
              Beberapa Wi-Fi publik / kantor mengaktifkan <em>AP Isolation</em> yang melarang perangkat saling berkomunikasi di jaringan lokal.
            </p>
          </div>

          <div className="bg-surface-inset p-4 rounded-2xl border border-border space-y-1.5">
            <strong className="text-text block font-semibold text-sm">
              3. Izin Firewall Komputer
            </strong>
            <p className="text-text-muted leading-relaxed">
              {isLinux
                ? 'Pada Linux, pastikan firewall mengizinkan port WSS.'
                : 'Pada Windows, pastikan prompt Windows Firewall diizinkan saat aplikasi pertama dibuka.'}
            </p>
          </div>
        </div>

        {/* Linux Firewall command helper */}
        {isLinux && troubleshooting?.firewallCmd && (
          <div className="bg-surface-inset border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Terminal className="w-4 h-4 text-accent shrink-0" />
              <div className="min-w-0">
                <span className="text-[11px] text-text-muted font-medium block">
                  Perintah Terminal Linux untuk membuka port firewall:
                </span>
                <code className="text-xs font-mono text-accent-text block truncate">
                  {troubleshooting.firewallCmd}
                </code>
              </div>
            </div>

            <button
              onClick={handleCopyCmd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-control hover:bg-control-hover active:bg-control-pressed text-text border border-control-border transition-colors shrink-0"
            >
              {copiedCmd ? (
                <>
                  <Check className="w-3.5 h-3.5 text-accent" />
                  <span className="text-accent">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Perintah</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
