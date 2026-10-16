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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-teal-400 font-semibold text-base">
            <QrCode className="w-5 h-5" />
            <span>Pasangkan Ponsel Android</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* State 1: Incoming Pair Request Approval */}
        {pendingPairRequest ? (
          <div className="p-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mx-auto glow-teal">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">
                Permintaan Sambungan Baru
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Ponsel <strong className="text-teal-300">{pendingPairRequest.deviceName}</strong> ingin terhubung ke komputer ini.
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-700/50 rounded-2xl p-5 space-y-1">
              <span className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider block">
                KODE VERIFIKASI IDENTIK
              </span>
              <span className="text-3xl font-bold font-mono tracking-widest text-white block">
                {pendingPairRequest.verificationCode}
              </span>
              <span className="text-xs text-slate-500 block pt-1">
                Pastikan kode 6-digit pada layar HP Anda persis sama.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => onRespondPair(pendingPairRequest.requestId, false)}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
              >
                Tolak
              </button>
              <button
                onClick={() => onRespondPair(pendingPairRequest.requestId, true)}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold transition-colors shadow-lg shadow-teal-500/25"
              >
                Izinkan
              </button>
            </div>
          </div>
        ) : (
          /* State 2: Normal QR Code Display */
          <div className="p-6 space-y-5">
            <div className="bg-white p-3 rounded-2xl shadow-inner flex items-center justify-center mx-auto w-64 h-64">
              {session?.qrDataUrl ? (
                <img
                  src={session.qrDataUrl}
                  alt="Kode QR SyncBoard"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mb-2" />
                  <span>Membuat Kode QR...</span>
                </div>
              )}
            </div>

            {/* Countdown timer & Regenerate button */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>
                  Kedaluwarsa dalam:{' '}
                  <strong className={remainingSec < 20 ? 'text-rose-400' : 'text-slate-200'}>
                    {formatTimer(remainingSec)}
                  </strong>
                </span>
              </div>

              <button
                onClick={loadSession}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Buat Ulang Kode</span>
              </button>
            </div>

            {/* Step-by-step guidance */}
            <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-4 space-y-2 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold shrink-0 text-[11px]">
                  1
                </span>
                <span>Buka aplikasi <strong>SyncBoard</strong> di ponsel Android.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold shrink-0 text-[11px]">
                  2
                </span>
                <span>Pilih menu <strong>Pindai QR</strong> lalu arahkan kamera ke kode di atas.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold shrink-0 text-[11px]">
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
