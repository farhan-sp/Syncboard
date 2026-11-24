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
      bg: 'bg-control text-text-muted border-control-border',
      icon: Clock,
      label: 'Menunggu',
    },
    Mengirim: {
      bg: 'bg-accent-tint-bg text-accent-tint-text border-accent-tint-bg/40',
      icon: RefreshCw,
      label: 'Mengirim',
      animate: true,
    },
    Selesai: {
      bg: 'bg-accent-tint-bg text-accent-tint-text border-accent-tint-bg/40',
      icon: CheckCircle2,
      label: 'Selesai',
    },
    Dibatalkan: {
      bg: 'bg-control text-text-muted border-control-border',
      icon: XCircle,
      label: 'Dibatalkan',
    },
    Gagal: {
      bg: 'bg-danger-bg text-danger-text border-danger-border',
      icon: AlertCircle,
      label: 'Gagal',
    },
  }[status] || {
    bg: 'bg-control text-text-muted border-control-border',
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
