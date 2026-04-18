// RF-02, RF-05: Eventos en tiempo real vía WebSocket
// Funciona de forma segura al estar sin conexión.
import { io } from 'socket.io-client'
import { useAuthStore } from '../store/authStore'
import { useMenuStore } from '../store/menuStore'
import { useOrderStore } from '../store/orderStore'
import { useAlertStore } from '../store/alertStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'https://api.mesaplus.local'

let socket = null

export function connectSocket() {
  const { token, waiter } = useAuthStore.getState()
  if (!token || socket?.connected) return

  // MOCK ROUTING: Para el modo standalone, crearemos un socket falso local
  socket = {
    connected: true,
    handlers: {},
    on(event, cb) {
      if (!this.handlers[event]) this.handlers[event] = []
      this.handlers[event].push(cb)
    },
    emit(event, payload) {
      console.log(`[Mock WS Emit] ${event}`, payload)
    },
    disconnect() {
      this.connected = false
    }
  }

  // Exponer API global para pruebas manuales (Simulación)
  window.emitMockSocketEvent = (event, payload) => {
    if (socket && socket.handlers[event]) {
      socket.handlers[event].forEach(cb => cb(payload))
    }
  }

  setTimeout(() => window.emitMockSocketEvent('connect'), 200)

  window.simulateExclusion = (item_id = 101, item_name = 'Tacos de Pastor (3)') => {
    window.emitMockSocketEvent('item_excluded', { item_id, item_name })
    console.log(`%c[Mock] Evento 'item_excluded' emitido para ${item_name}`, 'color: yellow; font-weight: bold')
  }

  window.simulateOrderReady = (order_id) => {
    window.emitMockSocketEvent('order_status_update', { order_id, status: 'listo' })
    console.log(`%c[Mock] Evento 'order_status_update' (listo) emitido para ${order_id}`, 'color: green; font-weight: bold')
  }

  socket.on('connect', () => {
    console.info('[WS] Connected')
    // Unirse a la sala específica del mesero
    socket.emit('join_waiter_room', { waiter_id: waiter?.id })
  })

  socket.on('disconnect', () => {
    console.warn('[WS] Disconnected')
  })

  // ── RF-02: item_excluded — marcar como no disponible en ≤ 2s visual (RNF-01) ──
  socket.on('item_excluded', ({ item_id, item_name }) => {
    // Actualizar la tienda de menú de inmediato (actualización síncrona <16ms)
    useMenuStore.getState().excludeItem(item_id)

    // RF-13: Alertar si algún pedido pendiente contiene este ítem
    const pendingOrders = useOrderStore
      .getState()
      .orders.filter(
        (o) =>
          (o.status === 'pendiente' || o.status === 'en_preparacion') &&
          o.items.some((i) => i.id === item_id)
      )

    if (pendingOrders.length > 0) {
      const ids = pendingOrders.map((o) => o.id).join(', ')
      useAlertStore.getState().addAlert({
        type: 'conflict',
        message: `El ítem "${item_name}" fue marcado como no disponible. Pedido(s) afectado(s): ${ids}. Contacta al cliente para ofrecer alternativa.`,
        duration: 10000,
      })
    } else {
      useAlertStore.getState().addAlert({
        type: 'exclusion',
        message: `"${item_name}" fue marcado como no disponible.`,
        duration: 5000,
      })
    }
  })

  // ── RF-02: item_restored ──────────────────────────────────────────────────
  socket.on('item_restored', ({ item_id }) => {
    useMenuStore.getState().restoreItem(item_id)
  })

  // ── RF-05: Actualización de estado de pedido ──────────────────────────────
  socket.on('order_status_update', ({ order_id, status }) => {
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
  })

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export function getSocket() {
  return socket
}
