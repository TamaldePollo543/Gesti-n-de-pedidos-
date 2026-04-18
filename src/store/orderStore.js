// RF-04: POST /orders a la API
// RF-05: Actualizaciones de estado en tiempo real vía WebSocket
// RNF-06, RNF-07: Cola offline con sincronización e indicador "Pendiente de sync"
import { create } from 'zustand'
import { ordersAPI, withRetry } from '../services/api'
import { enqueueOrder, dequeueOrder, getAllQueued } from '../services/offlineQueue'
import { useAuthStore } from './authStore'

export const ORDER_STATUSES = {
  PENDING: 'pendiente',
  PREPARING: 'en_preparacion',
  READY: 'listo',
  SERVED: 'servido',
  CANCELLED: 'cancelado',
}

function generateOrderId() {
  return 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()
}

export const useOrderStore = create((set, get) => ({
  orders: [],
  isLoading: false,
  offlineQueue: [],    // IDs de pedidos pendientes de sincronización

  // ── Cargar pedidos existentes ──────────────────────────────────────────────
  loadOrders: async () => {
    const { waiter } = useAuthStore.getState()
    set({ isLoading: true })
    try {
      const res = await ordersAPI.getMyOrders(waiter.id)
      set({ orders: res.data })
    } catch {
      // Offline — cargar desde la cola en IndexedDB
      const queued = await getAllQueued()
      set({ orders: queued, offlineQueue: queued.map((o) => o.id) })
    } finally {
      set({ isLoading: false })
    }
  },

  // ── RF-04: Crear pedido ──────────────────────────────────────────────────
  createOrder: async (cartItems, tableId, customerName, isOffline) => {
    const { waiter } = useAuthStore.getState()
    const order = {
      id: generateOrderId(),
      items: cartItems,
      table_id: tableId,
      customer_name: customerName,
      status: ORDER_STATUSES.PENDING,
      waiter_id: waiter.id,         // RF-14
      timestamp: new Date().toISOString(),  // RF-14
      created_at: new Date().toISOString(),
    }

    // Inserción local optimista
    set((state) => ({ orders: [order, ...state.orders] }))

    if (isOffline) {
      // RNF-06: guardar en IndexedDB
      await enqueueOrder(order)
      set((state) => ({ offlineQueue: [...state.offlineQueue, order.id] }))
      return { success: true, offline: true, order }
    }

    try {
      const res = await withRetry(() => ordersAPI.createOrder(order))
      // Actualizar con el ID asignado por el servidor si es diferente
      const serverOrder = res.data
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === order.id ? { ...serverOrder, status: ORDER_STATUSES.PENDING } : o
        ),
      }))
      return { success: true, offline: false, order: serverOrder }
    } catch (err) {
      // Falló la red a mitad del intento — respaldar a la cola offline (RNF-07)
      await enqueueOrder(order)
      set((state) => ({ offlineQueue: [...state.offlineQueue, order.id] }))
      return { success: true, offline: true, order }
    }
  },

  // ── RF-05: Actualizar estado del pedido desde WebSocket ────────────────────
  updateOrderStatus: (orderId, status) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status } : o
      ),
    })),

  // ── RNF-06: Sincronizar cola offline con backoff exponencial ───────────────
  syncOfflineQueue: async () => {
    const queued = await getAllQueued()
    if (!queued.length) return

    const results = []
    for (const order of queued) {
      try {
        await withRetry(() => ordersAPI.createOrder(order), 4, 500)
        await dequeueOrder(order.id)
        set((state) => ({
          offlineQueue: state.offlineQueue.filter((id) => id !== order.id),
          orders: state.orders.map((o) =>
            o.id === order.id ? { ...o, synced: true } : o
          ),
        }))
        results.push({ id: order.id, success: true })
      } catch {
        results.push({ id: order.id, success: false })
      }
    }
    return results
  },

  isOrderOffline: (orderId) => get().offlineQueue.includes(orderId),

  getPendingCount: () => get().offlineQueue.length,
}))
