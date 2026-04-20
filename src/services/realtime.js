// RF-02, RF-05: Eventos en tiempo real vía Supabase Realtime o socket.io
// Usa Supabase Realtime como preferencia, fallback a socket.io si no está configurado
import { createClient } from '@supabase/supabase-js'
import { io } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'
import { useMenuStore } from '../store/menuStore'
import { useOrderStore } from '../store/orderStore'
import { useAlertStore } from '../store/alertStore'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const WS_URL = import.meta.env.VITE_WS_URL || 'https://api.mesaplus.local'

let realtimeClient = null
let subscriptions = []

function handleItemExcluded(payload = {}) {
  const { item_id, item_name, reason } = payload
  const affectedCount = Number(payload.affected_orders_count || payload.affectedOrders || 0)

  useMenuStore.getState().excludeItem(item_id, reason)

  const pendingOrders = useOrderStore
    .getState()
    .orders.filter(
      (o) =>
        (o.status === 'pendiente' || o.status === 'en_preparacion') &&
        o.items.some((i) => i.id === item_id)
    )

  if (affectedCount > 0) {
    useAlertStore.getState().addAlert({
      type: 'conflict',
      message: `Hay ${affectedCount} pedido(s) pendiente(s) con este ítem. Los meseros han sido notificados.`,
      duration: 9000,
    })
    return
  }

  if (pendingOrders.length > 0) {
    const ids = pendingOrders.map((o) => o.id).join(', ')
    useAlertStore.getState().addAlert({
      type: 'conflict',
      message: `El ítem "${item_name}" fue marcado como no disponible. Pedido(s) afectado(s): ${ids}. Contacta al cliente para ofrecer alternativa.`,
      duration: 10000,
    })
    return
  }

  useAlertStore.getState().addAlert({
    type: 'exclusion',
    message: `"${item_name}" fue marcado como no disponible.`,
    duration: 5000,
  })
}

function handleItemRestored({ item_id }) {
  useMenuStore.getState().restoreItem(item_id)
}

function handleMenuItemUpsert(payload = {}) {
  const item = payload?.item || payload?.menu_item || payload
  if (!item?.id) return
  useMenuStore.getState().upsertItem(item)
}

function handleOrderStatusUpdate({ order_id, status }) {
  useOrderStore.getState().updateOrderStatus(order_id, status)

  if (status === 'listo') {
    useAlertStore.getState().addAlert({
      type: 'success',
      message: `¡Pedido ${order_id} está listo para servir!`,
      duration: 6000,
    })
  }
  if (status === 'cancelado') {
    useAlertStore.getState().addAlert({
      type: 'warning',
      message: `Pedido ${order_id} fue cancelado por cocina.`,
      duration: 6000,
    })
  }
}

function handleOrderCreated(payload) {
  const order = payload?.order || payload
  if (!order?.id) return

  useOrderStore.getState().addOrUpdateOrder(order)
  useAlertStore.getState().addAlert({
    type: 'info',
    message: `Nuevo pedido recibido: ${order.id}`,
    duration: 5000,
  })
}

class MockRealtimeAdapter {
  async connect() {
    window.emitMockSocketEvent = (event, payload) => {
      if (event === 'item_excluded') handleItemExcluded(payload)
      if (event === 'item_restored') handleItemRestored(payload)
      if (event === 'menu_item_created' || event === 'item_created' || event === 'menu_item_updated') {
        handleMenuItemUpsert(payload)
      }
      if (event === 'order_status_update') handleOrderStatusUpdate(payload)
      if (event === 'order_created') handleOrderCreated(payload)
    }

    window.simulateExclusion = (item_id = 101, item_name = 'Tacos de Pastor (3)') => {
      window.emitMockSocketEvent('item_excluded', { item_id, item_name })
    }

    window.simulateOrderReady = (order_id) => {
      window.emitMockSocketEvent('order_status_update', { order_id, status: 'listo' })
    }

    return true
  }

  async disconnect() {
    delete window.emitMockSocketEvent
    delete window.simulateExclusion
    delete window.simulateOrderReady
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ADAPTADOR SUPABASE REALTIME
// ─────────────────────────────────────────────────────────────────────────
class SupabaseRealtimeAdapter {
  constructor() {
    this.client = null
    this.token = null
    this.channel = null
  }

  async connect(token, waiter) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return false

    try {
      this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      })

      this.token = token
      const waiterId = waiter?.id

      // Suscribirse a cambios de menú (disponibilidad de items)
      const menuChannel = this.client.channel('menu:items', {
        config: { broadcast: { self: true } },
      })

      menuChannel.on('broadcast', { event: 'item_excluded' }, ({ payload }) => {
        this._handleItemExcluded(payload)
      })

      menuChannel.on('broadcast', { event: 'item_restored' }, ({ payload }) => {
        this._handleItemRestored(payload)
      })

      menuChannel.on('broadcast', { event: 'menu_item_created' }, ({ payload }) => {
        this._handleMenuItemUpsert(payload)
      })

      menuChannel.on('broadcast', { event: 'menu_item_updated' }, ({ payload }) => {
        this._handleMenuItemUpsert(payload)
      })

      menuChannel.on('broadcast', { event: 'item_created' }, ({ payload }) => {
        this._handleMenuItemUpsert(payload)
      })

      menuChannel.on('broadcast', { event: 'order_created' }, ({ payload }) => {
        this._handleOrderCreated(payload)
      })

      await menuChannel.subscribe()
      subscriptions.push(menuChannel)
      console.info('[Realtime] Subscribed to menu:items')

      // Suscribirse a cambios de pedidos del mesero
      if (waiterId) {
        const ordersChannel = this.client.channel(`orders:${waiterId}`, {
          config: { broadcast: { self: true } },
        })

        ordersChannel.on('broadcast', { event: 'order_status_update' }, ({ payload }) => {
          this._handleOrderStatusUpdate(payload)
        })

        ordersChannel.on('broadcast', { event: 'order_created' }, ({ payload }) => {
          this._handleOrderCreated(payload)
        })

        await ordersChannel.subscribe()
        subscriptions.push(ordersChannel)
        console.info(`[Realtime] Subscribed to orders:${waiterId}`)
      }

      return true
    } catch (err) {
      console.warn('[Realtime] Supabase connection failed, falling back to socket.io:', err.message)
      return false
    }
  }

  _handleItemExcluded({ item_id, item_name }) {
    handleItemExcluded({ item_id, item_name })
  }

  _handleItemRestored({ item_id }) {
    handleItemRestored({ item_id })
  }

  _handleOrderStatusUpdate({ order_id, status }) {
    handleOrderStatusUpdate({ order_id, status })
  }

  _handleOrderCreated(payload) {
    handleOrderCreated(payload)
  }

  _handleMenuItemUpsert(payload) {
    handleMenuItemUpsert(payload)
  }

  async disconnect() {
    for (const sub of subscriptions) {
      await this.client?.removeChannel(sub)
    }
    subscriptions = []
    this.client = null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// FALLBACK SOCKET.IO (compatible con API central o mock)
// ─────────────────────────────────────────────────────────────────────────
class SocketIOAdapter {
  constructor() {
    this.socket = null
  }

  async connect(token, waiter) {
    try {
      this.socket = io(WS_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 3,
        transports: ['websocket', 'polling'],
        timeout: 5000,
      })

      return new Promise((resolve) => {
        const connectTimeout = setTimeout(() => {
          console.warn('[Socket.io] Connection timeout (5s)')
          this.socket?.disconnect()
          this.socket = null
          resolve(false)
        }, 5000)

        this.socket.on('connect', () => {
          clearTimeout(connectTimeout)
          console.info('[Socket.io] ✅ Connected')
          if (waiter?.id) {
            this.socket.emit('join_waiter_room', { waiter_id: waiter.id })
          }
          resolve(true)
        })

        this.socket.on('connect_error', (error) => {
          clearTimeout(connectTimeout)
          console.warn('[Socket.io] Connection error:', error?.message || error)
          this.socket?.disconnect()
          this.socket = null
          resolve(false)
        })

        this.socket.on('error', (error) => {
          console.error('[Socket.io] Error:', error)
        })

        this.socket.on('disconnect', () => {
          console.warn('[Socket.io] Disconnected')
        })

        this.socket.on('item_excluded', (payload) => {
          this._handleItemExcluded(payload)
        })

        this.socket.on('item_restored', (payload) => {
          this._handleItemRestored(payload)
        })

        this.socket.on('menu_item_created', (payload) => {
          this._handleMenuItemUpsert(payload)
        })

        this.socket.on('menu_item_updated', (payload) => {
          this._handleMenuItemUpsert(payload)
        })

        this.socket.on('item_created', (payload) => {
          this._handleMenuItemUpsert(payload)
        })

        this.socket.on('order_status_update', (payload) => {
          this._handleOrderStatusUpdate(payload)
        })

        this.socket.on('order_created', (payload) => {
          this._handleOrderCreated(payload)
        })
      })
    } catch (err) {
      console.warn('[Socket.io] Connection setup failed:', err?.message || err)
      return false
    }
  }

  _handleItemExcluded({ item_id, item_name }) {
    handleItemExcluded({ item_id, item_name })
  }

  _handleItemRestored({ item_id }) {
    handleItemRestored({ item_id })
  }

  _handleOrderStatusUpdate({ order_id, status }) {
    handleOrderStatusUpdate({ order_id, status })
  }

  _handleOrderCreated(payload) {
    handleOrderCreated(payload)
  }

  _handleMenuItemUpsert(payload) {
    handleMenuItemUpsert(payload)
  }

  disconnect() {
    this.socket?.disconnect()
    this.socket = null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// INTERFAZ PUBLICA
// ─────────────────────────────────────────────────────────────────────────
export async function connectRealtime() {
  const { token, waiter } = useAuthStore.getState()
  if (!token) return

  if (window.__MESA_PLUS_MOCK__) {
    const mockAdapter = new MockRealtimeAdapter()
    await mockAdapter.connect()
    realtimeClient = mockAdapter
    return
  }

  // Intentar Supabase Realtime primero (si está configurado)
  if (SUPABASE_URL && SUPABASE_KEY) {
    const supabaseAdapter = new SupabaseRealtimeAdapter()
    const supabaseConnected = await supabaseAdapter.connect(token, waiter)

    if (supabaseConnected) {
      realtimeClient = supabaseAdapter
      console.info('[Realtime] ✅ Using Supabase Realtime')
      return
    }
    console.warn('[Realtime] ⚠️ Supabase Realtime connection failed')
  } else {
    console.warn('[Realtime] ⚠️ Supabase not configured (VITE_SUPABASE_URL not set)')
  }

  // Fallback a socket.io solo si WS_URL es accesible
  if (WS_URL && !WS_URL.includes('mesaplus.local')) {
    console.info('[Realtime] Attempting Socket.io connection to:', WS_URL)
    const socketAdapter = new SocketIOAdapter()
    const socketConnected = await socketAdapter.connect(token, waiter)

    if (socketConnected) {
      realtimeClient = socketAdapter
      console.info('[Realtime] ✅ Using Socket.io')
      return
    }
  } else {
    console.warn('[Realtime] ⚠️ Skipping Socket.io (WS_URL not configured or using localhost)')
  }

  console.warn('[Realtime] ⚠️ No real-time transport available. App will work offline-only (no live updates).')
}

export async function disconnectRealtime() {
  if (realtimeClient) {
    await realtimeClient.disconnect()
    realtimeClient = null
  }
}

export function getRealtimeClient() {
  return realtimeClient
}

// Helpers para testing y modo offline (simulación de eventos)
export function simulateItemExcluded(item_id = 101, item_name = 'Test Item') {
  if (!realtimeClient) return
  realtimeClient._handleItemExcluded?.({ item_id, item_name })
  window.emitMockSocketEvent?.('item_excluded', { item_id, item_name })
}

export function simulateOrderStatusUpdate(order_id, status = 'listo') {
  if (!realtimeClient) return
  realtimeClient._handleOrderStatusUpdate?.({ order_id, status })
  window.emitMockSocketEvent?.('order_status_update', { order_id, status })
}

export function simulateOrderCreated(order) {
  if (!realtimeClient) return
  realtimeClient._handleOrderCreated?.(order)
  window.emitMockSocketEvent?.('order_created', order)
}
