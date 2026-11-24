import React from 'react';
import { DeviceModel } from '@shared/types';

interface PillCollapsedProps {
  device: DeviceModel | null;
  hasUnread?: boolean;
  onClick: () => void;
}

export const PillCollapsed: React.FC<PillCollapsedProps> = ({ device, hasUnread, onClick }) => {
  const isConnected = device?.status === 'connected';
  const deviceName = device?.name || 'Belum terhubung';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-[190px] h-[40px] rounded-full bg-bg-app border border-border flex items-center justify-center gap-[10px] px-3.5 cursor-pointer shadow-island hover:border-accent/40 active:scale-[0.98] transition-all duration-150 select-none overflow-hidden"
      title="Buka panel SyncBoard"
    >
      {/* 8px Status Dot */}
      <div className="relative flex items-center justify-center shrink-0">
        <span
          className={`w-2 h-2 rounded-full transition-colors ${
            isConnected ? 'bg-accent' : 'bg-text-muted'
          }`}
        />
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent animate-ping" />
        )}
      </div>

      {/* "SyncBoard" label */}
      <span className="text-[13px] font-semibold text-text shrink-0 leading-none">
        SyncBoard
      </span>

      {/* Device Name */}
      <span className="text-[12px] text-text-muted truncate max-w-[65px] leading-none">
        {deviceName}
      </span>
    </div>
  );
};

export default PillCollapsed;
