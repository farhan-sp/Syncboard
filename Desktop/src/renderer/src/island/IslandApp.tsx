import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import {
  islandReducer,
  INITIAL_ISLAND_CONTEXT,
  IslandActivity,
  IslandTab,
} from './reducer';
import PillCollapsed from './PillCollapsed';
import PillActivity from './PillActivity';
import PanelExpanded from './PanelExpanded';
import { useSettings } from '../hooks/useSettings';
import { useDevices } from '../hooks/useDevices';
import { useTransfers } from '../hooks/useTransfers';

export const IslandApp: React.FC = () => {
  const [state, dispatch] = useReducer(islandReducer, INITIAL_ISLAND_CONTEXT);
  const [clipboardCopied, setClipboardCopied] = useState(false);
  const { settings, updateSetting } = useSettings();
  const { devices, activeDevice } = useDevices();
  const { transfers, sendText, sendFiles } = useTransfers();

  const activityTimerRef = useRef<any>(null);
  const hoverStartTimeRef = useRef<number | null>(null);
  const remainingTimeRef = useRef<number | null>(null);
  const prevIslandStateRef = useRef<string>(state.state);

  // 1. Theme Synchronization
  useEffect(() => {
    const applyTheme = (theme: string, isDarkPref?: boolean) => {
      const root = document.documentElement;
      let isDark = false;
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'light') {
        isDark = false;
      } else if (theme === 'system') {
        isDark =
          isDarkPref !== undefined
            ? isDarkPref
            : window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(settings.theme);

    const api = (window as any).island;
    const unsubTheme = api?.onEvent?.('theme:changed', (data: { theme: string; isDark: boolean }) => {
      applyTheme(data.theme, data.isDark);
    });

    return () => {
      unsubTheme?.();
    };
  }, [settings.theme]);

  // 2. Expand and Collapse Window Bounds Synchronization
  const handleExpand = useCallback(async () => {
    try {
      const api = (window as any).island;
      // Main process resizes Electron window bounds first before morph
      if (api?.requestExpand) {
        await api.requestExpand();
      }
    } catch (err) {
      console.error('Failed to request expand bounds:', err);
    }
    dispatch({ type: 'CLICK_PILL' });
  }, []);

  const handleCollapse = useCallback(() => {
    dispatch({ type: 'COLLAPSE' });
  }, []);

  // When state changes from expanded to collapsed or activity, notify main process after CSS morph
  useEffect(() => {
    const prev = prevIslandStateRef.current;
    const current = state.state;
    prevIslandStateRef.current = current;

    if (prev === 'expanded' && current !== 'expanded') {
      const timer = setTimeout(() => {
        const api = (window as any).island;
        if (api?.setBounds) {
          const stateName = current === 'activity' ? (state.currentActivity?.type || 'progress') : 'collapsed';
          api.setBounds(stateName);
        }
      }, 290);
      return () => clearTimeout(timer);
    } else if (prev !== current) {
      const api = (window as any).island;
      if (api?.setBounds) {
        let stateName = current;
        if (current === 'activity' && state.currentActivity) {
          if (state.currentActivity.type === 'file_offer') stateName = 'file_offer';
          else if (state.currentActivity.type === 'transfer_progress') stateName = 'progress';
          else stateName = 'text_link';
        }
        api.setBounds(stateName);
      }
    }
  }, [state.state, state.currentActivity]);

  // 3. Activity Timers (with pause on hover)
  useEffect(() => {
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }

    const activity = state.currentActivity;
    if (!activity || state.state === 'expanded' || state.isHovered) return;

    let duration = activity.timeoutMs;
    if (!duration) {
      if (activity.type === 'link_received' || activity.type === 'text_received') {
        duration = 5000;
      } else if (activity.status === 'done') {
        duration = 3000;
      } else if (activity.status === 'failed' || activity.status === 'cancelled') {
        duration = 6000;
      }
    }

    if (duration) {
      const timeToWait = remainingTimeRef.current !== null ? remainingTimeRef.current : duration;
      activityTimerRef.current = setTimeout(() => {
        remainingTimeRef.current = null;
        dispatch({ type: 'TIMEOUT', activityId: activity.id });
      }, timeToWait);
    }

    return () => {
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
        activityTimerRef.current = null;
      }
    };
  }, [state.currentActivity, state.state, state.isHovered]);

  const handleMouseEnter = () => {
    dispatch({ type: 'SET_HOVER', hovered: true });
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    dispatch({ type: 'SET_HOVER', hovered: false });
  };

  // 4. Blur and Escape Listeners
  useEffect(() => {
    let blurTimer: any = null;
    const onBlur = () => {
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) {
          dispatch({ type: 'BLUR' });
        }
      }, 150);
    };

    const onFocus = () => {
      if (blurTimer) clearTimeout(blurTimer);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'COLLAPSE' });
      }
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown);
      if (blurTimer) clearTimeout(blurTimer);
    };
  }, []);

  // 5. IPC Event Subscriptions
  useEffect(() => {
    const api = (window as any).island;
    if (!api?.onEvent) return;

    const unsubActivity = api.onEvent('island:activity', (act: any) => {
      let mappedType: any = act.type;
      if (act.type === 'progress') mappedType = 'transfer_progress';
      if (act.type === 'text_link') mappedType = act.isUrl ? 'link_received' : 'text_received';

      const activity: IslandActivity = {
        id: act.id || String(Date.now()),
        type: mappedType,
        priority: act.priority || 0,
        title: act.filename || act.title || (act.isUrl ? 'Tautan' : 'Teks'),
        subtitle: act.subtitle,
        deviceName: act.deviceName,
        progress: act.percent ?? (act.totalBytes ? Math.round((act.bytesReceived / act.totalBytes) * 100) : 0),
        status: act.status || 'active',
        url: act.isUrl ? act.text : undefined,
        text: act.text,
        requestId: act.requestId || act.offerId || act.id,
        fileSize: act.size ? `${Math.round(act.size / 1024)} KB` : undefined,
        createdAt: Date.now(),
      };
      dispatch({ type: 'ACTIVITY', payload: activity });
    });

    const unsubToggle = api.onEvent('island:toggle', () => {
      if (state.state === 'expanded') {
        dispatch({ type: 'COLLAPSE' });
      } else {
        handleExpand();
      }
    });

    const unsubProgress = api.onEvent('transfer:progress', (data: any) => {
      dispatch({
        type: 'ACTIVITY_UPDATE',
        payload: {
          id: data.id,
          progress: data.percent ?? (data.totalBytes ? Math.round((data.bytesReceived / data.totalBytes) * 100) : 0),
        },
      });
    });

    const unsubDone = api.onEvent('transfer:done', (data: any) => {
      dispatch({
        type: 'ACTIVITY_UPDATE',
        payload: {
          id: data.id,
          status: 'done',
          progress: 100,
          timeoutMs: 3000,
        },
      });
    });

    const unsubError = api.onEvent('transfer:error', (data: any) => {
      dispatch({
        type: 'ACTIVITY_UPDATE',
        payload: {
          id: data.id,
          status: 'failed',
          timeoutMs: 6000,
        },
      });
    });

    const unsubClipboard = api.onEvent('island:clipboard-auto-copied', () => {
      setClipboardCopied(true);
      setTimeout(() => setClipboardCopied(false), 2000);
    });

    return () => {
      unsubActivity?.();
      unsubToggle?.();
      unsubProgress?.();
      unsubDone?.();
      unsubError?.();
      unsubClipboard?.();
    };
  }, [state.state, handleExpand]);

  // 6. Island Action Helpers
  const handleCancelTransfer = async (id: string) => {
    try {
      const api = (window as any).island;
      await api?.cancelTransfer?.(id);
      dispatch({ type: 'DISMISS_CURRENT' });
    } catch (err) {
      console.error('Failed to cancel transfer:', err);
    }
  };

  const handleRespondOffer = async (offerId: string, accept: boolean) => {
    try {
      const api = (window as any).island;
      await api?.respondFileOffer?.({ offerId, accept });
      dispatch({ type: 'DISMISS_CURRENT' });
    } catch (err) {
      console.error('Failed to respond offer:', err);
    }
  };

  const handleSelectFiles = async (): Promise<string[] | null> => {
    try {
      const api = (window as any).island || (window as any).syncboard;
      if (api?.selectFilesToSend) {
        return await api.selectFilesToSend();
      }
    } catch (err) {
      console.error('Failed to select files:', err);
    }
    return null;
  };

  const handleOpenMainWindow = () => {
    const api = (window as any).island;
    api?.openMainWindow?.();
    dispatch({ type: 'COLLAPSE' });
  };

  const handleOpenPairModal = () => {
    const api = (window as any).island;
    api?.openPairModal?.();
    dispatch({ type: 'COLLAPSE' });
  };

  const handleDisconnectDevice = async (id: string) => {
    const api = (window as any).island || (window as any).syncboard;
    return await api?.disconnectDevice?.(id);
  };

  const handleRemoveDevice = async (id: string) => {
    const api = (window as any).island || (window as any).syncboard;
    return await api?.removeDevice?.(id);
  };

  // Determine current size and radius for CSS morph container
  let containerWidth = 190;
  let containerHeight = 40;
  let containerRadius = 20;

  if (state.state === 'expanded') {
    containerWidth = 520;
    containerHeight = 470;
    containerRadius = 28;
  } else if (state.state === 'activity' && state.currentActivity) {
    if (state.currentActivity.type === 'transfer_progress') {
      containerWidth = 380;
      containerHeight = 68;
      containerRadius = 34;
    } else {
      containerWidth = 440;
      containerHeight = 68;
      containerRadius = 34;
    }
  }

  return (
    <div className="w-full h-full flex items-start justify-center p-[12px] box-border overflow-hidden select-none">
      <div
        style={{
          width: `${containerWidth}px`,
          height: `${containerHeight}px`,
          borderRadius: `${containerRadius}px`,
          transition:
            'width 280ms cubic-bezier(.2,.8,.2,1), height 280ms cubic-bezier(.2,.8,.2,1), border-radius 280ms cubic-bezier(.2,.8,.2,1)',
        }}
        className="overflow-hidden flex items-center justify-center shrink-0"
      >
        {state.state === 'expanded' ? (
          <PanelExpanded
            activeTab={state.activeTab}
            onSelectTab={(tab: IslandTab) => dispatch({ type: 'SELECT_TAB', tab })}
            onCollapse={handleCollapse}
            devices={devices}
            activeDevice={activeDevice}
            transfers={transfers}
            settings={settings}
            onUpdateSetting={updateSetting}
            onSendText={sendText}
            onSendFiles={sendFiles}
            onSelectFiles={handleSelectFiles}
            onDisconnectDevice={handleDisconnectDevice}
            onRemoveDevice={handleRemoveDevice}
            onOpenMainWindow={handleOpenMainWindow}
            onOpenPairModal={handleOpenPairModal}
          />
        ) : state.state === 'activity' && state.currentActivity ? (
          <PillActivity
            activity={state.currentActivity}
            onCancelTransfer={handleCancelTransfer}
            onRespondOffer={handleRespondOffer}
            onExpandPanel={handleExpand}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          />
        ) : (
          <PillCollapsed
            device={activeDevice}
            hasUnread={state.hasUnreadInExpanded}
            clipboardFlash={clipboardCopied}
            onClick={handleExpand}
          />
        )}
      </div>
    </div>
  );
};

export default IslandApp;
