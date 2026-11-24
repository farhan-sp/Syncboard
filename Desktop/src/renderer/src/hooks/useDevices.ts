import { useState, useEffect, useCallback } from 'react';
import { DeviceModel } from '@shared/types';

export function useDevices(apiOverride?: any) {
  const [devices, setDevices] = useState<DeviceModel[]>([]);
  const [activeDevice, setActiveDevice] = useState<DeviceModel | null>(null);

  const getApi = useCallback(() => {
    return apiOverride || (window as any).syncboard || (window as any).island;
  }, [apiOverride]);

  const loadDevices = useCallback(async () => {
    try {
      const api = getApi();
      if (!api) return;
      const loaded = await api.getDevices?.();
      if (loaded) {
        setDevices(loaded);
        if (loaded.length > 0) {
          setActiveDevice((current) => {
            if (current) {
              const stillExists = loaded.find((d: DeviceModel) => d.id === current.id);
              if (stillExists) return stillExists;
            }
            const connected = loaded.find((d: DeviceModel) => d.status === 'connected');
            return connected || loaded[0];
          });
        } else {
          setActiveDevice(null);
        }
      }
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  }, [getApi]);

  const renameDevice = useCallback(
    async (id: string, newName: string) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.renameDevice?.(id, newName);
        await loadDevices();
      } catch (err) {
        console.error('Failed to rename device:', err);
      }
    },
    [getApi, loadDevices]
  );

  const disconnectDevice = useCallback(
    async (id: string) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.disconnectDevice?.(id);
        await loadDevices();
      } catch (err) {
        console.error('Failed to disconnect device:', err);
      }
    },
    [getApi, loadDevices]
  );

  const removeDevice = useCallback(
    async (id: string) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.removeDevice?.(id);
        await loadDevices();
      } catch (err) {
        console.error('Failed to remove device:', err);
      }
    },
    [getApi, loadDevices]
  );

  useEffect(() => {
    loadDevices();

    const api = getApi();
    if (!api) return;

    const unsub = api.onDeviceStatusChange?.((updatedDevices: DeviceModel[]) => {
      setDevices(updatedDevices);
      setActiveDevice((current) => {
        if (!current) {
          const connected = updatedDevices.find((d) => d.status === 'connected');
          return connected || updatedDevices[0] || null;
        }
        const found = updatedDevices.find((d) => d.id === current.id);
        return found || updatedDevices[0] || null;
      });
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [getApi, loadDevices]);

  return {
    devices,
    activeDevice,
    setActiveDevice,
    renameDevice,
    disconnectDevice,
    removeDevice,
    reloadDevices: loadDevices,
  };
}
