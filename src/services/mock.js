import MockAdapter from 'axios-mock-adapter'
import { apiClient } from './api'

// Base de datos falsa
const wait = (ms) => new Promise(r => setTimeout(r, ms))

const db = {
  menu: [
    { id: 101, name: 'Tacos de Pastor (3)', category: 'Tacos', price: 90, available: true },
    { id: 102, name: 'Tacos de Bistec (3)', category: 'Tacos', price: 110, available: true },
    { id: 103, name: 'Guacamole con Totopos', category: 'Entradas', price: 120, available: true },
    { id: 104, name: 'Queso Fundido con Chorizo', category: 'Entradas', price: 150, available: true },
    { id: 105, name: 'Enchiladas Suizas', category: 'Especialidades', price: 180, available: true },
    { id: 106, name: 'Pechuga a la Parrilla', category: 'Especialidades', price: 160, available: true },
    { id: 107, name: 'Agua de Horchata (Litro)', category: 'Bebidas', price: 50, available: true },
    { id: 108, name: 'Cerveza Artesanal', category: 'Bebidas', price: 85, available: false }, // Agotado
    { id: 109, name: 'Limonada Mineral', category: 'Bebidas', price: 45, available: true },
    { id: 110, name: 'Hamburguesa Clásica', category: 'Especialidades', price: 140, available: true },
    { id: 111, name: 'Papas a la Francesa', category: 'Entradas', price: 60, available: true },
    { id: 112, name: 'Flan Napolitano', category: 'Postres', price: 55, available: true },
    { id: 113, name: 'Pastel de Chocolate', category: 'Postres', price: 70, available: false }, // Agotado
    { id: 114, name: 'Tacos de Suadero (3)', category: 'Tacos', price: 100, available: true },
    { id: 115, name: 'Tacos de Campechano (3)', category: 'Tacos', price: 115, available: true },
  ],
  orders: []
}

let mockId = 1000

export function setupMock() {
  window.__MESA_PLUS_MOCK__ = true
  const mock = new MockAdapter(apiClient, { delayResponse: 800 })

  console.info('[Mock] Módulo Backend Simulado Iniciado')

  // RF-15: Authentication Mock
  mock.onPost('/auth/login').reply((config) => {
    const { email, password } = JSON.parse(config.data)
    if (email && password) {
      // Extraer el nombre del correo (ej: "juan.perez@..." -> "Juan Perez")
      const emailName = email.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      
      return [200, {
        token: 'fake-jwt-token-12345',
        waiter: { id: 1, name: emailName || 'Mesero', role: 'waiter' }
      }]
    }
    return [401, { message: 'Credenciales inválidas' }]
  })

  // RF-01: Fetch Menu
  mock.onGet('/menu/items?available=true').reply(() => {
    // Devolver solo ítems disponibles
    return [200, db.menu.filter(item => item.available)]
  })

  mock.onGet(/\/menu-items\?limit=\d+/).reply(() => {
    return [200, { data: db.menu, total: db.menu.length, page: 1, limit: db.menu.length }]
  })

  mock.onPatch(/\/menu-items\/[^/]+\/availability/).reply((config) => {
    const id = config.url.split('/')[2]
    const body = JSON.parse(config.data)
    const item = db.menu.find((m) => String(m.id) === String(id))
    if (!item) return [404, { message: 'Item no encontrado' }]

    item.available = !!body.available
    if (!item.available) {
      const affected = db.orders.filter(
        (o) =>
          (o.status === 'pendiente' || o.status === 'en_preparacion') &&
          (o.items || []).some((i) => String(i.id) === String(item.id))
      ).length

      window.emitMockSocketEvent?.('item_excluded', {
        item_id: item.id,
        item_name: item.name,
        reason: body.reason,
        affected_orders_count: affected,
      })

      return [200, { data: { ...item, affected_orders_count: affected } }]
    }

    window.emitMockSocketEvent?.('item_restored', {
      item_id: item.id,
      item_name: item.name,
    })
    return [200, { data: item }]
  })

  // RF-04: Create Order
  mock.onPost('/orders').reply(async (config) => {
    const orderData = JSON.parse(config.data)
    
    const newOrder = {
      id: `ORD-${mockId++}`,
      ...orderData,
      status: 'pendiente', // RF-05 status
      created_at: new Date().toISOString()
    }
    db.orders.push(newOrder)

    window.emitMockSocketEvent?.('order_created', { order: newOrder })

    // Simular avance en cocina (Pendiente -> En_preparacion -> Listo)
    setTimeout(() => {
      newOrder.status = 'en_preparacion'
      if (window.emitMockSocketEvent) {
        window.emitMockSocketEvent('order_status_update', { order_id: newOrder.id, status: 'en_preparacion' })
      }
      
      setTimeout(() => {
        newOrder.status = 'listo'
        if (window.emitMockSocketEvent) {
          window.emitMockSocketEvent('order_status_update', { order_id: newOrder.id, status: 'listo' })
        }
      }, 15000) // 15 segundos para estar listo
    }, 5000)

    return [201, newOrder]
  })

  // RF-05: Get Waiter Orders
  mock.onGet(/\/orders\?waiter_id=\d+/).reply((config) => {
    return [200, db.orders]
  })

  mock.onGet('/orders?active=true').reply(() => {
    const active = db.orders.filter((o) => ['pendiente', 'en_preparacion', 'listo'].includes(o.status))
    return [200, active]
  })

  mock.onGet('/orders').reply(() => {
    return [200, db.orders]
  })

  mock.onPatch(/\/orders\/[^/]+\/status/).reply((config) => {
    const id = config.url.split('/')[2]
    const body = JSON.parse(config.data)
    const order = db.orders.find((o) => String(o.id) === String(id))
    if (!order) return [404, { message: 'Pedido no encontrado' }]

    order.status = body.status
    window.emitMockSocketEvent?.('order_status_update', {
      order_id: order.id,
      status: order.status,
    })
    return [200, order]
  })
}
