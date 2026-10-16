import React from 'react';
import { TransferStatus } from '@shared/types';
import { Clock, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface Props {
  status: TransferStatus;
  size?: 'sm' | 'md';
}

export const TransferStatusChip: React.FC<Props> = ({ status, size = 'md' }) => {
  const isSm = size === 'sm';

  const config = {
    Menunggu: {
      bg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      icon: Clock,
      label: 'Menunggu',
    },
    Mengirim: {
      bg: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
      icon: RefreshCw,
      label: 'Mengirim',
      animate: true,
    },
    Selesai: {
      bg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Selesai',
    },
    Dibatalkan: {
      bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      icon: XCircle,
      label: 'Dibatalkan',
    },
    Gagal: {
      bg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      icon: AlertCircle,
      label: 'Gagal',
    },
  }[status] || {
    bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    icon: Clock,
    label: status,
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bg} ${
        isSm ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${config.animate ? 'animate-spin' : ''}`} />
      <span>{config.label}</span>
    </span>
  );
};
