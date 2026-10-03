export const SETTLEMENT_SAVE_KEY = 'village-ascend-v11-state';
export const LEGACY_SETTLEMENT_SAVE_KEY = 'village-ascend-v2-state';

// Keep the old key untouched: cached v10 clients rewrite it without v11 fields.
// Import under the same command lock used for every subsequent mutation.
export function settlementStorageBridge(storage) {
  const validate = raw => {
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved?.state || typeof saved.state !== 'object' || saved.version > 11) throw Error('Unsupported Settlement save');
  };
  return {
    prepare() {
      const current = storage.getItem(SETTLEMENT_SAVE_KEY);
      validate(current);
      if (current != null) return;
      const legacy = storage.getItem(LEGACY_SETTLEMENT_SAVE_KEY);
      validate(legacy);
      if (legacy != null) storage.setItem(SETTLEMENT_SAVE_KEY, legacy);
    },
    getItem: name => storage.getItem(name),
    setItem: (name, value) => storage.setItem(name, value),
    removeItem: name => storage.removeItem(name),
  };
}

let lockDatabase;
// An IndexedDB readwrite transaction grants exclusive access across tabs.
// Only the mutex lives here; the actual save remains in localStorage. There
// is no network request, shared wallet, or deletion of a legacy save.
export function lockSettlementCommand(work) {
  if (typeof window === 'undefined') return work();
  if (!globalThis.indexedDB) return Promise.reject(Error('Settlement storage unavailable'));
  lockDatabase ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('ccgh-settlement-command-lock', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('commands');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Settlement storage blocked'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); lockDatabase = undefined; };
      resolve(db);
    };
  });
  return lockDatabase.then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction('commands', 'readwrite');
    const request = transaction.objectStore('commands').get('mutex');
    let result;
    request.onsuccess = () => {
      try { result = work(); }
      catch (error) { transaction.abort(); reject(error); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || Error('Settlement command interrupted'));
    transaction.onerror = () => reject(transaction.error);
  }));
}

// Every domain command refreshes inside the lock, before any affordability,
// stale-order, or completion checks. Rehydration itself does not write a v11
// snapshot. Raw set is reserved for restoring a failed write and UI status.
export function serializeSettlementCommands(initializer, bridge, lock) {
  return (set, get, api) => {
    const initial = initializer(set, get, api);
    const originalSetState = api.setState;
    const originalRehydrate = api.persist?.rehydrate;
    const refresh = () => { bridge?.prepare(); originalRehydrate?.(); };
    const failed = (recover = false, snapshot) => {
      if (snapshot) set(snapshot, true);
      if (recover) try { refresh(); } catch { /* Preserve the last known in-memory state. */ }
      set({ persistenceError: true, persistenceReady: true });
      return false;
    };
    const run = work => {
      if (!bridge && typeof window !== 'undefined') return failed();
      try {
        const result = lock(() => {
          let snapshot;
          try {
            refresh();
            snapshot = get();
            const value = work();
            set({ persistenceError: false, persistenceReady: true });
            return value;
          } catch { return failed(true, snapshot); }
        });
        return result?.then ? result.catch(() => failed()) : result;
      } catch { return failed(); }
    };
    api.setState = (...args) => run(() => originalSetState(...args));
    api.initializeSettlementPersistence = () => run(() => undefined);
    if (api.persist) api.persist.rehydrate = api.initializeSettlementPersistence;
    // Preserve getters without evaluating them before Zustand installs state.
    const descriptors = Object.getOwnPropertyDescriptors(initial);
    for (const descriptor of Object.values(descriptors)) {
      if (typeof descriptor.value === 'function') {
        const command = descriptor.value;
        descriptor.value = (...args) => run(() => command(...args));
      }
    }
    return Object.defineProperties({}, descriptors);
  };
}
