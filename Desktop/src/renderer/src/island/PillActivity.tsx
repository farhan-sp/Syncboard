import React, { useState } from 'react';
import { File, Link as LinkIcon, MessageSquare, Download, X, Check, CheckCircle2, AlertCircle } from 'lucide-react';
import { IslandActivity } from './reducer';

interface PillActivityProps {
  activity: IslandActivity;
  onCancelTransfer?: (id: string) => void;
  onRespondOffer?: (offerId: string, accept: boolean) => void;
  onExpandPanel: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const PillActivity: React.FC<PillActivityProps> = ({
  activity,
  onCancelTransfer,
  onRespondOffer,
  onExpandPanel,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = activity.url || activity.text || activity.title;
    try {
      const api = (window as any).island || (window as any).syncboard;
      if (api?.copyToClipboard) {
        await api.copyToClipboard(textToCopy);
      } else {
        await navigator.clipboard.writeText(textToCopy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = activity.url || activity.text;
    if (url) {
      const api = (window as any).island || (window as any).syncboard;
      if (api?.openExternal) {
        api.openExternal(url);
      } else {
        window.open(url, '_blank');
      }
    }
  };

  const handleAcceptOffer = (e: React.MouseEvent) => {
    e.stopPropagation();
    const reqId = activity.requestId || activity.id;
    if (onRespondOffer) {
      onRespondOffer(reqId, true);
    }
  };

  const handleDeclineOffer = (e: React.MouseEvent) => {
    e.stopPropagation();
    const reqId = activity.requestId || activity.id;
    if (onRespondOffer) {
      onRespondOffer(reqId, false);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCancelTransfer) {
      onCancelTransfer(activity.id);
    }
  };

  // 1. Transfer Progress
  if (activity.type === 'transfer_progress') {
    const isCompleted = activity.status === 'done';
    const isFailed = activity.status === 'failed' || activity.status === 'cancelled';
    const progressPercent = activity.progress ?? 0;
    const deviceName = activity.deviceName || 'Perangkat';

    let subText = `Mengirim ke ${deviceName} · ${progressPercent}%`;
    if (activity.subtitle) {
      subText = activity.subtitle;
    } else if (isCompleted) {
      subText = 'Transfer selesai';
    } else if (isFailed) {
      subText = 'Transfer dibatalkan / gagal';
    }

    return (
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onExpandPanel}
        className="w-[380px] h-[68px] rounded-[34px] bg-bg-app border border-border px-4 pl-[14px] flex items-center justify-between gap-3 shadow-island select-none cursor-pointer hover:border-accent/30 transition-all duration-150"
      >
        {/* Tile */}
        <div className="w-[38px] h-[38px] rounded-[12px] bg-tile flex items-center justify-center shrink-0">
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5 text-accent" />
          ) : isFailed ? (
            <AlertCircle className="w-5 h-5 text-danger-text" />
          ) : (
            <File className="w-5 h-5 text-text-secondary" />
          )}
        </div>

        {/* Text and Progress */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-text truncate max-w-[210px] leading-tight">
              {activity.title}
            </span>
          </div>

          <span className="text-[12px] text-text-muted truncate leading-tight mt-0.5">
            {subText}
          </span>

          {/* 4px Progress Bar */}
          <div className="w-full bg-divider rounded-full overflow-hidden h-1 mt-1.5">
            <div
              className={`h-full transition-all duration-200 rounded-full ${
                isCompleted
                  ? 'bg-accent'
                  : isFailed
                  ? 'bg-danger-text'
                  : 'bg-accent'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, progressPercent))}%` }}
            />
          </div>
        </div>

        {/* Cancel Button */}
        {!isCompleted && !isFailed && (
          <button
            onClick={handleCancel}
            aria-label="Batalkan transfer"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-control-hover text-text-muted hover:text-text transition-colors shrink-0"
            title="Batalkan transfer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // 2. File Offer
  if (activity.type === 'file_offer') {
    const deviceName = activity.deviceName || 'Perangkat';
    const sub = activity.fileSize
      ? `${activity.fileSize} · dari ${deviceName}`
      : `dari ${deviceName}`;

    return (
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={onExpandPanel}
        className="w-[440px] h-[68px] rounded-[34px] bg-bg-app border border-border px-4 pl-[14px] flex items-center justify-between gap-3 shadow-island select-none cursor-pointer hover:border-accent/30 transition-all duration-150"
      >
        {/* Tile */}
        <div className="w-[38px] h-[38px] rounded-[12px] bg-tile flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-accent" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <span className="text-[13px] font-semibold text-text truncate max-w-[210px] leading-tight">
            {activity.title}
          </span>
          <span className="text-[12px] text-text-muted truncate leading-tight mt-0.5">
            {sub}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDeclineOffer}
            className="h-8 px-3 rounded-lg bg-control hover:bg-control-hover border border-control-border text-text text-xs font-medium transition-colors"
          >
            Tolak
          </button>
          <button
            onClick={handleAcceptOffer}
            className="h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold transition-colors"
          >
            Terima
          </button>
        </div>
      </div>
    );
  }

  // 3. Text or Link Received
  const isUrl =
    activity.type === 'link_received' ||
    Boolean(activity.url) ||
    /^https?:\/\//i.test(activity.text || activity.title || '');
  const deviceName = activity.deviceName || 'Perangkat';
  const headingTitle = isUrl ? `Tautan dari ${deviceName}` : `Teks dari ${deviceName}`;
  const snippet = activity.text || activity.url || activity.title;

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onExpandPanel}
      className="w-[440px] h-[68px] rounded-[34px] bg-bg-app border border-border px-4 pl-[14px] flex items-center justify-between gap-3 shadow-island select-none cursor-pointer hover:border-accent/30 transition-all duration-150"
    >
      {/* Tile */}
      <div className="w-[38px] h-[38px] rounded-[12px] bg-tile flex items-center justify-center shrink-0">
        {isUrl ? (
          <LinkIcon className="w-5 h-5 text-accent" />
        ) : (
          <MessageSquare className="w-5 h-5 text-text-secondary" />
        )}
      </div>

      {/* Text Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="text-[13px] font-semibold text-text truncate max-w-[200px] leading-tight">
          {headingTitle}
        </span>
        <span className="text-[12px] text-text-muted truncate max-w-[200px] leading-tight mt-0.5 font-mono">
          {snippet}
        </span>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCopy}
          className="h-8 px-3 rounded-lg bg-control hover:bg-control-hover border border-control-border text-text text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-accent" />
              <span>Tersalin!</span>
            </>
          ) : (
            <span>Salin</span>
          )}
        </button>
        {isUrl && (
          <button
            onClick={handleOpenUrl}
            className="h-8 px-3 rounded-lg bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold transition-colors"
          >
            Buka
          </button>
        )}
      </div>
    </div>
  );
};

export default PillActivity;
