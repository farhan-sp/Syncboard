import { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '@shared/types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  serverPort: 48620,
  deviceName: 'SyncBoard Desktop',
  downloadDir: '',
  confirmBeforeReceive: true,
  historyMode: 'simpan',
  retentionHours: 24,
  theme: 'dark',
  startWithSystem: false,
  islandEnabled: true,
  islandShortcut: 'CommandOrControl+Shift+Space',
  displayMode: 'window',
};

export function useSettings(apiOverride?: any) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);

  const getApi = useCallback(() => {
    return apiOverride || (window as any).syncboard || (window as any).island;
  }, [apiOverride]);

  const loadSettings = useCallback(async () => {
    try {
      const api = getApi();
      if (!api) return;
      const data = await api.getSettings?.();
      if (data) {
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, [getApi]);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      try {
        const api = getApi();
        if (!api) return;
        await api.saveSetting?.(key, value);
      } catch (err) {
        console.error(`Failed to save setting ${String(key)}:`, err);
      }
    },
    [getApi]
  );

  // Sync theme class 'dark' with html documentElement
  useEffect(() => {
    const applyTheme = () => {
      let isDark = true;
      if (settings.theme === 'light') {
        isDark = false;
      } else if (settings.theme === 'dark') {
        isDark = true;
      } else if (settings.theme === 'system') {
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (settings.theme === 'system' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [settings.theme]);

  useEffect(() => {
    loadSettings();

    const api = getApi();
    if (!api) return;

    // Listen for external settings/theme updates
    const unsub = api.onSettingsUpdate?.((newSettings: Partial<AppSettings>) => {
      if (newSettings) {
        setSettings((prev) => ({ ...prev, ...newSettings }));
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [getApi, loadSettings]);

  return {
    settings,
    setSettings,
    updateSetting,
    reloadSettings: loadSettings,
  };
}
