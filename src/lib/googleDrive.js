/**
 * Backup to the user's own Google Drive, in the hidden per-app folder
 * (`appDataFolder`). Nothing here touches a server of mine: the browser gets
 * an OAuth token directly from Google and talks to the Drive REST API.
 *
 * Exactly one backup file is kept. Every save overwrites it in place via its
 * file id, so repeated backups never accumulate copies.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILENAME = 'penny-backup.json';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function isGoogleConfigured() {
  return !!GOOGLE_CLIENT_ID;
}

let gisPromise = null;
let tokenClient = null;
// Access tokens are short-lived and deliberately kept in memory only — writing
// one to disk would outlive the tab for no benefit.
let cachedToken = null;
let tokenExpiry = 0;

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const script = existing || document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in.'));
    if (!existing) document.head.appendChild(script);
  });
  return gisPromise;
}

async function getTokenClient() {
  if (tokenClient) return tokenClient;
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google backup is not configured (missing VITE_GOOGLE_CLIENT_ID).');
  }
  await loadGis();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: () => {}, // replaced per-request below
  });
  return tokenClient;
}

/**
 * @param {object} opts
 * @param {boolean} opts.interactive Show the Google consent screen if needed.
 *   Background backups pass `false` so they can refresh a token silently but
 *   never pop a window the user didn't ask for.
 */
export async function getAccessToken({ interactive = false } = {}) {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  const client = await getTokenClient();

  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      cachedToken = response.access_token;
      tokenExpiry = Date.now() + (Number(response.expires_in) || 3600) * 1000;
      resolve(cachedToken);
    };
    client.error_callback = (err) => {
      reject(new Error(err?.type === 'popup_closed'
        ? 'Google sign-in was cancelled.'
        : 'Google sign-in failed.'));
    };

    // An empty prompt reuses an existing grant without any UI; 'consent'
    // forces the picker on first connect.
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

function forgetToken() {
  cachedToken = null;
  tokenExpiry = 0;
}

export async function revokeAccess() {
  if (cachedToken && window.google?.accounts?.oauth2) {
    await new Promise((resolve) => window.google.accounts.oauth2.revoke(cachedToken, resolve));
  }
  forgetToken();
}

/** Pulls Google's own reason and message out of an error response body. */
function readDriveError(body) {
  try {
    const err = JSON.parse(body)?.error;
    return {
      reason: err?.errors?.[0]?.reason || err?.status || '',
      message: err?.message || '',
    };
  } catch {
    return { reason: '', message: '' };
  }
}

async function driveFetch(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (res.ok) return res;

  const body = await res.text().catch(() => '');
  const { reason, message } = readDriveError(body);

  // 401 is the only status that actually means the token is dead. Dropping it
  // makes the next call re-authorise.
  if (res.status === 401) {
    forgetToken();
    throw new Error('Google access expired. Reconnect in Settings.');
  }

  // 403 means the token is fine but the request isn't allowed. Clearing it here
  // would send the user round a reconnect loop that cannot fix the cause, so
  // the reason has to be reported instead.
  if (res.status === 403) {
    if (reason === 'accessNotConfigured') {
      throw new Error(
        'The Google Drive API is not enabled for this Google Cloud project. '
        + 'Enable it under APIs & Services → Library, wait a minute, then try again.'
      );
    }
    if (reason === 'insufficientPermissions' || reason === 'insufficientFilePermissions') {
      forgetToken();
      throw new Error(
        'Penny was not granted the Drive app-data permission. '
        + 'Reconnect in Settings and accept the request.'
      );
    }
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      throw new Error('Google Drive is rate limiting this app. Try again in a minute.');
    }
    throw new Error(message || 'Google Drive refused the request (403).');
  }

  throw new Error(`Google Drive error ${res.status}: ${(message || body).slice(0, 200)}`);
}

export async function getGoogleAccount(token) {
  const res = await driveFetch(token, 'https://www.googleapis.com/drive/v3/about?fields=user');
  const data = await res.json();
  return data.user?.emailAddress || null;
}

/**
 * Finds the single backup file, cleaning up any stray duplicates a past
 * failure might have left behind.
 */
export async function findBackupFile(token) {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${BACKUP_FILENAME}' and trashed = false`,
    fields: 'files(id, modifiedTime, size)',
    orderBy: 'modifiedTime desc',
    pageSize: '10',
  });
  const res = await driveFetch(token, `${DRIVE_FILES}?${params}`);
  const { files = [] } = await res.json();
  if (files.length === 0) return null;

  for (const stale of files.slice(1)) {
    await driveFetch(token, `${DRIVE_FILES}/${stale.id}`, { method: 'DELETE' })
      .catch(() => {});
  }
  return files[0];
}

/**
 * Writes the backup, overwriting the existing file when one is known.
 * Returns the file id so the caller can keep reusing it.
 */
export async function uploadBackup(token, fileId, data) {
  const body = JSON.stringify(data);
  const metadata = fileId
    ? { name: BACKUP_FILENAME }
    : { name: BACKUP_FILENAME, parents: ['appDataFolder'] };

  const boundary = `penny-${Math.random().toString(36).slice(2)}`;
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    body,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const url = fileId
    ? `${DRIVE_UPLOAD}/${fileId}?uploadType=multipart&fields=id,modifiedTime`
    : `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,modifiedTime`;

  const res = await driveFetch(token, url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  return res.json();
}

export async function downloadBackup(token, fileId) {
  const res = await driveFetch(token, `${DRIVE_FILES}/${fileId}?alt=media`);
  return res.json();
}

export async function deleteBackup(token, fileId) {
  await driveFetch(token, `${DRIVE_FILES}/${fileId}`, { method: 'DELETE' });
}
