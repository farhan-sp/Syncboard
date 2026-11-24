import { useState, useEffect, useCallback } from 'react';
import { TransferModel } from '@shared/types';

export function useTransfers(apiOverride?: any) {
  const [transfers, setTransfers] = useState<TransferModel[]>([]);

  const getApi = useCallback(() => {
    return apiOverride || (window as any).syncboard || (window as any).island;
  }, [apiOverride]);

  const loadTransfers = useCallback(async () => {
    try {
      const api = getApi();
      if (!api) return;
      const loaded = await api.getTransfers?.();
      if (loaded) {
        setTransfers(loaded);
      }
    } catch (err) {
      console.error('Failed to load transfers:', err);
    }
  }, [getApi]);

  const sendText = useCallback(
    async (text: string, kind: 'text' | 'link' = 'text') => {
      try {
        const api = getApi();
        if (!api) return;
        await api.sendText?.(text, kind);
        await loadTransfers();
      } catch (err) {
        console.error('Failed to send text:', err);
      }
    },
    [getApi, loadTransfers]
  );

  const sendFiles = useCallback(
    async (filePaths: string[]) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.sendFiles?.(filePaths);
        await loadTransfers();
      } catch (err) {
        console.error('Failed to send files:', err);
      }
    },
    [getApi, loadTransfers]
  );

  const retryTransfer = useCallback(
    async (id: string) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.retryTransfer?.(id);
        await loadTransfers();
      } catch (err) {
        console.error('Failed to retry transfer:', err);
      }
    },
    [getApi, loadTransfers]
  );

  const cancelTransfer = useCallback(
    async (id: string) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.cancelTransfer?.(id);
        await loadTransfers();
      } catch (err) {
        console.error('Failed to cancel transfer:', err);
      }
    },
    [getApi, loadTransfers]
  );

  const deleteTransfer = useCallback(
    async (id: string) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.deleteTransfer?.(id);
        await loadTransfers();
      } catch (err) {
        console.error('Failed to delete transfer:', err);
      }
    },
    [getApi, loadTransfers]
  );

  const pinTransfer = useCallback(
    async (id: string, pinned: number) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.pinTransfer?.(id, pinned);
        await loadTransfers();
      } catch (err) {
        console.error('Failed to pin transfer:', err);
      }
    },
    [getApi, loadTransfers]
  );

  const clearAllTransfers = useCallback(async () => {
    try {
      const api = getApi();
      if (!api) return;
      await api.clearAllTransfers?.();
      setTransfers([]);
    } catch (err) {
      console.error('Failed to clear transfers:', err);
    }
  }, [getApi]);

  const respondFileOffer = useCallback(
    async (requestId: string, accept: boolean, savePath?: string) => {
      try {
        const api = getApi();
        if (!api) return;
        await api.respondFileOffer?.({ requestId, accept, savePath });
        await loadTransfers();
      } catch (err) {
        console.error('Failed to respond file offer:', err);
      }
    },
    [getApi, loadTransfers]
  );

  useEffect(() => {
    loadTransfers();

    const api = getApi();
    if (!api) return;

    // Listen for single transfer updates
    const unsubTransfer = api.onTransferUpdate?.((updatedTransfer: TransferModel) => {
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.id === updatedTransfer.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedTransfer;
          return next;
        }
        return [updatedTransfer, ...prev];
      });
    });

    // Listen for progress updates
    const unsubProgress = api.onTransferProgress?.((data: { id: string; bytesReceived?: number; bytesTransferred?: number }) => {
      const bytes = data.bytesReceived ?? data.bytesTransferred ?? 0;
      setTransfers((prev) =>
        prev.map((t) => (t.id === data.id ? { ...t, bytesTransferred: bytes } : t))
      );
    });

    return () => {
      if (typeof unsubTransfer === 'function') unsubTransfer();
      if (typeof unsubProgress === 'function') unsubProgress();
    };
  }, [getApi, loadTransfers]);

  return {
    transfers,
    setTransfers,
    sendText,
    sendFiles,
    retryTransfer,
    cancelTransfer,
    deleteTransfer,
    pinTransfer,
    clearAllTransfers,
    respondFileOffer,
    reloadTransfers: loadTransfers,
  };
}
