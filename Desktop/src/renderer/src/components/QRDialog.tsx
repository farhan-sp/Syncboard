import React, { useEffect, useState } from 'react';
import { PairingSessionData, PendingPairRequest } from '@shared/types';
import { X, RefreshCw, QrCode, ShieldCheck, Clock, Wifi } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pendingPairRequest?: PendingPairRequest | null;
  onRespondPair: (requestId: string, accept: boolean) => void;
}

export const QRDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  pendingPairRequest,
  onRespondPair,
}) => {
  const [session, setSession] = useState<PairingSessionData | null>(null);
  const [remainingSec, setRemainingSec] = useState(120);
  const [loading, setLoading] = useState(false);

  const loadSession = async () => {
    setLoading(true);
    try {
      const data = await (window as any).syncboard?.createPairingSession();
      if (data) {
        setSession(data);
        const rem = Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000));
        setRemainingSec(rem);
      }
    } catch (err) {
      console.error('Failed to create pairing session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSession();
    }
  }, [isOpen]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || !session) return;
    const interval = setInterval(() => {
      const rem = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
      setRemainingSec(rem);
      if (rem <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, session]);

  if (!isOpen) return null;

  const formatTimer = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-surface border border-border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden text-text">
        {/* Header */}
        <div className="px-6 py-4 border-b border-divider flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent font-semibold text-base">
            <QrCode className="w-5 h-5" />
            <span>Pasangkan Ponsel Android</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-control-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* State 1: Incoming Pair Request Approval */}
        {pendingPairRequest ? (
          <div className="p-6 text-center space-y-5 animate-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-tile border border-border flex items-center justify-center text-accent mx-auto shadow-sm">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-text">
                Permintaan Sambungan Baru
              </h3>
              <p className="text-sm text-text-muted mt-1">
                Ponsel <strong className="text-accent">{pendingPairRequest.deviceName}</strong> ingin terhubung ke komputer ini.
              </p>
            </div>

            <div className="bg-surface-inset border border-border rounded-2xl p-5 space-y-1">
              <span className="text-[11px] font-semibold text-accent uppercase tracking-wider block">
                KODE VERIFIKASI IDENTIK
              </span>
              <span className="text-3xl font-bold font-mono tracking-widest text-text block">
                {pendingPairRequest.verificationCode}
              </span>
              <span className="text-xs text-text-muted block pt-1">
                Pastikan kode 6-digit pada layar HP Anda persis sama.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => onRespondPair(pendingPairRequest.requestId, false)}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-danger-bg hover:opacity-90 active:opacity-80 text-danger-text border border-danger-border transition-colors"
              >
                Tolak
              </button>
              <button
                onClick={() => onRespondPair(pendingPairRequest.requestId, true)}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-bold bg-accent hover:bg-accent-hover active:bg-accent-pressed text-on-accent transition-colors shadow-sm"
              >
                Izinkan
              </button>
            </div>
          </div>
        ) : (
          /* State 2: Normal QR Code Display */
          <div className="p-6 space-y-5">
            <div className="bg-white p-3 rounded-2xl shadow-inner flex items-center justify-center mx-auto w-64 h-64 border border-border">
              {session?.qrDataUrl ? (
                <img
                  src={session.qrDataUrl}
                  alt="Kode QR SyncBoard"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-text-muted text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-accent mb-2" />
                  <span>Membuat Kode QR...</span>
                </div>
              )}
            </div>

            {/* Countdown timer & Regenerate button */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <Clock className="w-4 h-4 text-accent" />
                <span>
                  Kedaluwarsa dalam:{' '}
                  <strong className={remainingSec < 20 ? 'text-danger-text' : 'text-text'}>
                    {formatTimer(remainingSec)}
                  </strong>
                </span>
              </div>

              <button
                onClick={loadSession}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline disabled:opacity-45"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Buat Ulang Kode</span>
              </button>
            </div>

            {/* Step-by-step guidance */}
            <div className="bg-surface-inset border border-border rounded-2xl p-4 space-y-2 text-xs text-text-secondary">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-accent text-on-accent flex items-center justify-center font-bold shrink-0 text-[11px]">
                  1
                </span>
                <span>Buka aplikasi <strong>SyncBoard</strong> di ponsel Android.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-accent text-on-accent flex items-center justify-center font-bold shrink-0 text-[11px]">
                  2
                </span>
                <span>Pilih menu <strong>Pindai QR</strong> lalu arahkan kamera ke kode di atas.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-accent text-on-accent flex items-center justify-center font-bold shrink-0 text-[11px]">
                  3
                </span>
                <span>Pastikan kedua perangkat terhubung ke Wi-Fi lokal yang sama.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
