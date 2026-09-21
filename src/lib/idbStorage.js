/**
 * IndexedDB-backed storage adapter for Zustand's persist middleware.
 *
 * localStorage caps out around 5MB and every read/write is synchronous, which
 * blocks the main thread once the transaction list gets long. IndexedDB has no
 * practical size limit here and stays off the render path.
 *
 * Data written by the old localStorage build is migrated on first read.
 */

const DB_NAME = 'penny';
const DB_VERSION = 1;
const STORE = 'kv';
const LEGACY_KEY = 'penny-storage';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/**
 * Falls back to localStorage whenever IndexedDB throws (private browsing in
 * some browsers, blocked upgrades). Better a degraded app than a blank one.
 */
function lsFallback(op, key, value) {
  try {
    if (op === 'get') return localStorage.getItem(key);
    if (op === 'set') return localStorage.setItem(key, value);
    return localStorage.removeItem(key);
  } catch {
    return null;
  }
}

const idbStorage = {
  getItem: async (key) => {
    try {
      const value = await tx('readonly', (store) => store.get(key));
      if (value != null) return value;

      // First run after the localStorage → IndexedDB switch: adopt the old data.
      const legacy = lsFallback('get', key === 'penny-storage' ? LEGACY_KEY : key);
      if (legacy != null) {
        await tx('readwrite', (store) => store.put(legacy, key));
        return legacy;
      }
      return null;
    } catch {
      return lsFallback('get', key);
    }
  },

  setItem: async (key, value) => {
    try {
      await tx('readwrite', (store) => store.put(value, key));
    } catch {
      lsFallback('set', key, value);
    }
  },

  removeItem: async (key) => {
    try {
      await tx('readwrite', (store) => store.delete(key));
    } catch {
      lsFallback('remove', key);
    }
  },
};

/** Drops the legacy localStorage copy once IndexedDB holds the data. */
export async function clearLegacyStorage() {
  try {
    const migrated = await tx('readonly', (store) => store.get(LEGACY_KEY));
    if (migrated != null) localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nothing to clean up */
  }
}

/** Rough byte size of everything we persist — shown on the Settings page. */
export async function getStorageSize() {
  try {
    const value = await tx('readonly', (store) => store.get(LEGACY_KEY));
    return value ? new Blob([value]).size : 0;
  } catch {
    return 0;
  }
}

export default idbStorage;
