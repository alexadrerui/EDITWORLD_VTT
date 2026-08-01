import type { AssetKind, AssetMeta } from '../types'

// Binary asset storage — separate from useEditorStore's localStorage-backed
// scene persistence, since IndexedDB (unlike localStorage) can store a Blob
// natively without a base64 round-trip. One object store, keyed by `id`,
// holding metadata *and* the blob together; useEditorStore only ever keeps
// the metadata half (see AssetMeta) in memory, fetching the blob on demand
// via getAssetBlob so large files don't sit duplicated in JS heap + IndexedDB.
const DB_NAME = 'editworld-vtt-assets'
const DB_VERSION = 1
const STORE_NAME = 'assets'

interface AssetRecord extends AssetMeta {
  blob: Blob
  createdAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function genAssetId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `asset-${crypto.randomUUID()}`
    : `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = fn(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveAsset(file: File, kind: AssetKind): Promise<AssetMeta> {
  const record: AssetRecord = {
    id: genAssetId(),
    name: file.name,
    kind,
    mimeType: file.type,
    blob: file,
    createdAt: Date.now(),
  }
  await withStore('readwrite', (store) => store.put(record))
  const { id, name, mimeType } = record
  return { id, name, kind, mimeType }
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  const record = await withStore<AssetRecord | undefined>('readonly', (store) => store.get(id))
  return record?.blob
}

export async function listAssets(): Promise<AssetMeta[]> {
  const records = await withStore<AssetRecord[]>('readonly', (store) => store.getAll())
  return records
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ id, name, kind, mimeType }) => ({ id, name, kind, mimeType }))
}

export async function deleteAsset(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}
