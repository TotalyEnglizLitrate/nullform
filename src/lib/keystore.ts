// The master secret lives only in this browser's IndexedDB; it is never sent anywhere.
const DB = "nullform"
const STORE = "keys"
const KEY = "master"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const loadMaster = async (): Promise<Uint8Array | null> =>
  ((await tx("readonly", (s) => s.get(KEY))) as Uint8Array | undefined) ?? null

export const saveMaster = (master: Uint8Array) => tx("readwrite", (s) => s.put(master, KEY)).then(() => {})
