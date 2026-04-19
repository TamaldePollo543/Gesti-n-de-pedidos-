import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── cartStore ────────────────────────────────────────────────────────────────
import { useCartStore } from '../store/cartStore'

const ITEM_A = { id: 1, name: 'Tacos', price: 80, category: 'Tacos', available: true }
const ITEM_B = { id: 2, name: 'Pozole', price: 120, category: 'Sopas', available: true }

describe('cartStore', () => {
  beforeEach(() => useCartStore.setState({ items: [], tableId: '', customerName: '' }))

  it('adds a new item with qty 1', () => {
    const { addItem, items } = useCartStore.getState()
    act(() => addItem(ITEM_A))
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].qty).toBe(1)
  })

  it('increments qty when same item added again', () => {
    act(() => { useCartStore.getState().addItem(ITEM_A); useCartStore.getState().addItem(ITEM_A) })
    expect(useCartStore.getState().items[0].qty).toBe(2)
  })

  it('decrements qty and removes when qty reaches 0', () => {
    act(() => useCartStore.getState().addItem(ITEM_A))
    act(() => useCartStore.getState().decrementQty(1))
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  it('removes item directly', () => {
    act(() => { useCartStore.getState().addItem(ITEM_A); useCartStore.getState().addItem(ITEM_B) })
    act(() => useCartStore.getState().removeItem(1))
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].id).toBe(2)
  })

  it('calculates total correctly', () => {
    act(() => { useCartStore.getState().addItem(ITEM_A); useCartStore.getState().addItem(ITEM_A); useCartStore.getState().addItem(ITEM_B) })
    expect(useCartStore.getState().getTotal()).toBe(80 * 2 + 120)
  })

  it('isValid requires items AND (table OR customer)', () => {
    act(() => useCartStore.getState().addItem(ITEM_A))
    expect(useCartStore.getState().isValid()).toBe(false)
    act(() => useCartStore.getState().setTableId('Mesa 1'))
    expect(useCartStore.getState().isValid()).toBe(true)
  })

  it('clears cart', () => {
    act(() => { useCartStore.getState().addItem(ITEM_A); useCartStore.getState().setTableId('Mesa 1'); useCartStore.getState().clearCart() })
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(useCartStore.getState().tableId).toBe('')
  })

  it('getItemCount sums all quantities', () => {
    act(() => { useCartStore.getState().addItem(ITEM_A); useCartStore.getState().incrementQty(1); useCartStore.getState().addItem(ITEM_B) })
    expect(useCartStore.getState().getItemCount()).toBe(3)
  })
})

// ── menuStore ────────────────────────────────────────────────────────────────
import { useMenuStore } from '../store/menuStore'

const MENU = [
  { id: 1, name: 'Tacos de birria', category: 'Tacos', price: 85, available: true },
  { id: 2, name: 'Pozole rojo',     category: 'Sopas', price: 120, available: true },
  { id: 3, name: 'Agua de horchata',category: 'Bebidas', price: 35, available: false },
]

describe('menuStore', () => {
  beforeEach(() => useMenuStore.setState({ items: MENU, categories: ['Todos','Tacos','Sopas','Bebidas'], activeCategory: 'Todos', searchQuery: '' }))

  it('setItems builds category list', () => {
    act(() => useMenuStore.getState().setItems(MENU))
    expect(useMenuStore.getState().categories).toContain('Todos')
    expect(useMenuStore.getState().categories).toContain('Tacos')
  })

  it('excludeItem marks item unavailable (RF-02)', () => {
    act(() => useMenuStore.getState().excludeItem(1, 'Sin tomate'))
    const item = useMenuStore.getState().items.find(i => i.id === 1)
    expect(item.available).toBe(false)
    expect(item.unavailableReason).toBe('Sin tomate')
  })

  it('restoreItem marks item available (RF-02)', () => {
    act(() => useMenuStore.getState().restoreItem(3))
    const item = useMenuStore.getState().items.find(i => i.id === 3)
    expect(item.available).toBe(true)
  })

  it('getFilteredItems filters by category', () => {
    act(() => useMenuStore.getState().setActiveCategory('Tacos'))
    const filtered = useMenuStore.getState().getFilteredItems()
    expect(filtered.every(i => i.category === 'Tacos')).toBe(true)
  })

  it('getFilteredItems filters by search query', () => {
    act(() => useMenuStore.getState().setSearchQuery('pozole'))
    const filtered = useMenuStore.getState().getFilteredItems()
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toMatch(/pozole/i)
  })

  it('getFilteredItems returns all when category is Todos', () => {
    act(() => useMenuStore.getState().setActiveCategory('Todos'))
    expect(useMenuStore.getState().getFilteredItems()).toHaveLength(3)
  })
})

// ── orderStore ───────────────────────────────────────────────────────────────
import { useOrderStore } from '../store/orderStore'
import * as api from '../services/api'
import * as offlineQueue from '../services/offlineQueue'

vi.mock('../services/api', () => ({
  ordersAPI: {
    createOrder: vi.fn(),
    getMyOrders: vi.fn(),
  },
  withRetry: vi.fn((fn) => fn()),
}))

vi.mock('../services/offlineQueue', () => ({
  enqueueOrder: vi.fn(),
  dequeueOrder: vi.fn(),
  getAllQueued: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ waiter: { id: 'W001', name: 'Carlos' } }) },
}))

describe('orderStore', () => {
  beforeEach(() => {
    useOrderStore.setState({ orders: [], offlineQueue: [] })
    vi.clearAllMocks()
  })

  it('createOrder sends to API when online (RF-04)', async () => {
    api.ordersAPI.createOrder.mockResolvedValue({ data: { id: 'ORD-SERVER-1', status: 'pendiente', items: [], table_id: 'Mesa 1', customer_name: '', waiter_id: 'W001', timestamp: new Date().toISOString(), created_at: new Date().toISOString() } })
    await act(async () => {
      await useOrderStore.getState().createOrder([ITEM_A], 'Mesa 1', '', false)
    })
    expect(api.ordersAPI.createOrder).toHaveBeenCalledTimes(1)
    expect(offlineQueue.enqueueOrder).not.toHaveBeenCalled()
  })

  it('createOrder enqueues to IndexedDB when offline (RNF-06)', async () => {
    await act(async () => {
      await useOrderStore.getState().createOrder([ITEM_A], 'Mesa 2', '', true)
    })
    expect(offlineQueue.enqueueOrder).toHaveBeenCalledTimes(1)
    expect(api.ordersAPI.createOrder).not.toHaveBeenCalled()
  })

  it('createOrder falls back to offline queue on network error (RNF-07)', async () => {
    api.withRetry.mockRejectedValue(new Error('Network Error'))
    await act(async () => {
      await useOrderStore.getState().createOrder([ITEM_A], 'Mesa 3', '', false)
    })
    expect(offlineQueue.enqueueOrder).toHaveBeenCalledTimes(1)
  })

  it('updateOrderStatus updates correct order (RF-05)', () => {
    useOrderStore.setState({ orders: [{ id: 'ORD-1', status: 'pendiente', items: [], table_id: 'Mesa 1', customer_name: '', waiter_id: 'W001', timestamp: new Date().toISOString(), created_at: new Date().toISOString() }] })
    act(() => useOrderStore.getState().updateOrderStatus('ORD-1', 'en_preparacion'))
    expect(useOrderStore.getState().orders[0].status).toBe('en_preparacion')
  })

  it('isOrderOffline returns true only for queued orders (RNF-07)', async () => {
    await act(async () => {
      await useOrderStore.getState().createOrder([ITEM_A], '', 'Ana', true)
    })
    const id = useOrderStore.getState().orders[0].id
    expect(useOrderStore.getState().isOrderOffline(id)).toBe(true)
    expect(useOrderStore.getState().isOrderOffline('ORD-UNKNOWN')).toBe(false)
  })
})

// ── alertStore ────────────────────────────────────────────────────────────────
import { useAlertStore } from '../store/alertStore'

describe('alertStore', () => {
  beforeEach(() => useAlertStore.setState({ alerts: [] }))

  it('adds alert with correct fields', () => {
    act(() => useAlertStore.getState().addAlert({ type: 'exclusion', message: 'Test alert', duration: 0 }))
    expect(useAlertStore.getState().alerts).toHaveLength(1)
    expect(useAlertStore.getState().alerts[0].type).toBe('exclusion')
  })

  it('removeAlert removes by id', () => {
    act(() => useAlertStore.getState().addAlert({ type: 'info', message: 'Hello', duration: 0 }))
    const id = useAlertStore.getState().alerts[0].id
    act(() => useAlertStore.getState().removeAlert(id))
    expect(useAlertStore.getState().alerts).toHaveLength(0)
  })

  it('clearAll removes all alerts', () => {
    act(() => {
      useAlertStore.getState().addAlert({ type: 'info', message: 'A', duration: 0 })
      useAlertStore.getState().addAlert({ type: 'conflict', message: 'B', duration: 0 })
    })
    act(() => useAlertStore.getState().clearAll())
    expect(useAlertStore.getState().alerts).toHaveLength(0)
  })
})
