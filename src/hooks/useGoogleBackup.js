import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import useStore from '@/store/useStore';
import {
  getAccessToken, findBackupFile, uploadBackup, downloadBackup, deleteBackup,
  getGoogleAccount, revokeAccess, isGoogleConfigured,
} from '@/lib/googleDrive';

/** How long to wait after the last edit before pushing a backup. */
const DEBOUNCE_MS = 20_000;

/**
 * The hook runs once at the app root (see `BackupProvider`) and everything
 * else reads it through this context — a second instance would mean a second
 * store subscription and duplicate uploads.
 */
export const BackupContext = createContext(null);

export function useBackup() {
  const ctx = useContext(BackupContext);
  if (!ctx) throw new Error('useBackup must be used inside <BackupProvider>');
  return ctx;
}

/**
 * Keeps a single backup file in the user's Google Drive in sync with local
 * data. Backups are debounced after edits and flushed when the tab is hidden,
 * so a burst of typing produces one upload rather than dozens.
 */
export default function useGoogleBackup() {
  const syncSettings = useStore((s) => s.syncSettings);
  const setSyncSettings = useStore((s) => s.setSyncSettings);
  const hasHydrated = useStore((s) => s._hasHydrated);

  const [status, setStatus] = useState('idle'); // idle | syncing | error
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const lastPushedRef = useRef(0);

  const configured = isGoogleConfigured();
  const enabled = syncSettings.googleEnabled && configured;

  /** Pushes local data to Drive. `interactive` allows a consent popup. */
  const backupNow = useCallback(async ({ interactive = false } = {}) => {
    if (inFlightRef.current) return;
    const store = useStore.getState();
    if (!store.syncSettings.googleEnabled && !interactive) return;

    inFlightRef.current = true;
    setStatus('syncing');
    setError(null);

    try {
      const token = await getAccessToken({ interactive });
      let fileId = store.syncSettings.fileId;

      if (!fileId) {
        const existing = await findBackupFile(token);
        fileId = existing?.id || null;
      }

      const payload = store.exportData();
      const saved = await uploadBackup(token, fileId, payload);

      lastPushedRef.current = payload.dataUpdatedAt;
      setSyncSettings({
        fileId: saved.id,
        lastSyncedAt: new Date().toISOString(),
      });
      setStatus('idle');
      return saved;
    } catch (err) {
      setError(err.message);
      setStatus('error');
      throw err;
    } finally {
      inFlightRef.current = false;
    }
  }, [setSyncSettings]);

  /** Pulls the Drive copy and replaces local data with it. */
  const restoreNow = useCallback(async ({ interactive = true } = {}) => {
    setStatus('syncing');
    setError(null);
    try {
      const token = await getAccessToken({ interactive });
      const file = await findBackupFile(token);
      if (!file) throw new Error('No backup found in your Google Drive.');

      const data = await downloadBackup(token, file.id);
      useStore.getState().importData(data);

      lastPushedRef.current = useStore.getState().dataUpdatedAt;
      setSyncSettings({
        fileId: file.id,
        lastSyncedAt: new Date().toISOString(),
      });
      setConflict(null);
      setStatus('idle');
      return data;
    } catch (err) {
      setError(err.message);
      setStatus('error');
      throw err;
    }
  }, [setSyncSettings]);

  /**
   * First-time connect. Checks whether Drive already holds a newer copy —
   * silently overwriting someone's data from another device is the one thing
   * a backup feature must never do.
   */
  const connect = useCallback(async () => {
    setStatus('syncing');
    setError(null);
    try {
      const token = await getAccessToken({ interactive: true });
      const account = await getGoogleAccount(token);
      const file = await findBackupFile(token);

      setSyncSettings({ googleEnabled: true, account, fileId: file?.id || null });

      if (file) {
        const remote = await downloadBackup(token, file.id);
        const local = useStore.getState();
        const remoteNewer = (remote.dataUpdatedAt || 0) > (local.dataUpdatedAt || 0);
        const localEmpty = local.transactions.length === 0;

        if (remoteNewer || localEmpty) {
          setConflict({
            remoteUpdatedAt: remote.dataUpdatedAt,
            remoteTransactions: remote.transactions?.length ?? 0,
            localTransactions: local.transactions.length,
            localUpdatedAt: local.dataUpdatedAt,
          });
          setStatus('idle');
          return { conflict: true };
        }
      }

      await backupNow({ interactive: false });
      return { conflict: false };
    } catch (err) {
      setError(err.message);
      setStatus('error');
      setSyncSettings({ googleEnabled: false });
      throw err;
    }
  }, [backupNow, setSyncSettings]);

  const disconnect = useCallback(async ({ removeRemote = false } = {}) => {
    try {
      if (removeRemote && syncSettings.fileId) {
        const token = await getAccessToken({ interactive: false });
        await deleteBackup(token, syncSettings.fileId);
      }
      await revokeAccess();
    } catch {
      // Revocation is best-effort — disconnect locally regardless.
    }
    setSyncSettings({
      googleEnabled: false, fileId: null, account: null, lastSyncedAt: null,
    });
    setConflict(null);
    setStatus('idle');
    setError(null);
  }, [setSyncSettings, syncSettings.fileId]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  // Debounced auto-backup on any data change.
  useEffect(() => {
    if (!enabled || !hasHydrated || !syncSettings.autoBackup) return undefined;

    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.dataUpdatedAt === prev.dataUpdatedAt) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        backupNow().catch(() => {});
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timerRef.current);
    };
  }, [enabled, hasHydrated, syncSettings.autoBackup, backupNow]);

  // Flush pending changes when the tab goes away, so closing the app right
  // after an edit doesn't lose the debounce window.
  useEffect(() => {
    if (!enabled || !syncSettings.autoBackup) return undefined;

    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      const { dataUpdatedAt } = useStore.getState();
      if (dataUpdatedAt <= lastPushedRef.current) return;
      clearTimeout(timerRef.current);
      backupNow().catch(() => {});
    };

    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [enabled, syncSettings.autoBackup, backupNow]);

  const pendingChanges = useStore((s) => s.dataUpdatedAt) > lastPushedRef.current;

  return {
    configured,
    enabled,
    status,
    error,
    conflict,
    account: syncSettings.account,
    lastSyncedAt: syncSettings.lastSyncedAt,
    pendingChanges: enabled && pendingChanges,
    connect,
    disconnect,
    backupNow,
    restoreNow,
    dismissConflict,
  };
}
