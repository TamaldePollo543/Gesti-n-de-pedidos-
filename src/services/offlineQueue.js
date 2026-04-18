// RNF-06, RNF-07: Cola offline guardada en IndexedDB
// Respaldo en localStorage si IndexedDB falla
import { openDB } from 'idb'

const DB_NAME = 'mesa-plus'
const DB_VERSION = 1
const STORE_ORDERS = 'offline_orders'

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_ORDERS)) {
          const store = db.createObjectStore(STORE_ORDERS, { keyPath: 'id' })
          store.createIndex('by_status', 'status')
        }
      },
    }).catch(() => {
      // IndexedDB not available — use localStorage fallback
      dbPromise = null
      return null
    })
  }
  return dbPromise
}

// ── localStorage fallback helpers ─────────────────────────────────────────────
const LS_KEY = 'mesa_plus_offline_queue'

function lsGetAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

function lsSet(orders) {
  localStorage.setItem(LS_KEY, JSON.stringify(orders))
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function enqueueOrder(order) {
  const db = await getDB()
  if (db) {
    await db.put(STORE_ORDERS, { ...order, queued_at: Date.now() })
  } else {
    const all = lsGetAll()
    const idx = all.findIndex((o) => o.id === order.id)
    if (idx >= 0) all[idx] = order
    else all.push({ ...order, queued_at: Date.now() })
    lsSet(all)
  }
}

export async function dequeueOrder(orderId) {
  const db = await getDB()
  if (db) {
    await db.delete(STORE_ORDERS, orderId)
  } else {
    lsSet(lsGetAll().filter((o) => o.id !== orderId))
  }
}

export async function getAllQueued() {
  const db = await getDB()
  if (db) {
    return db.getAll(STORE_ORDERS)
  }
  return lsGetAll()
}

export async function clearQueue() {
  const db = await getDB()
  if (db) {
    await db.clear(STORE_ORDERS)
  } else {
    lsSet([])
  }
}
