import useGoogleBackup, { BackupContext } from '@/hooks/useGoogleBackup';

/**
 * Mounted once at the app root so auto-backup runs everywhere, not only while
 * the Settings page happens to be open.
 */
export function BackupProvider({ children }) {
  const backup = useGoogleBackup();
  return <BackupContext.Provider value={backup}>{children}</BackupContext.Provider>;
}
