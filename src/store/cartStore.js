// RF-03: Construir pedido — seleccionar ítems, ajustar cantidad, asociar mesa/cliente
// RNF-08: Completar flujo en ≤3 interacciones táctiles
import { create } from 'zustand'

export const useCartStore = create((set, get) => ({
  items: [],        // { id, name, price, category, qty }
  tableId: '',
  customerName: '',

  addItem: (menuItem) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === menuItem.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === menuItem.id ? { ...i, qty: i.qty + 1 } : i
          ),
        }
      }
      return { items: [...state.items, { ...menuItem, qty: 1 }] }
    }),

  removeItem: (itemId) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== itemId) })),

  setQty: (itemId, qty) =>
    set((state) => {
      if (qty <= 0) return { items: state.items.filter((i) => i.id !== itemId) }
      return {
        items: state.items.map((i) => (i.id === itemId ? { ...i, qty } : i)),
      }
    }),

  incrementQty: (itemId) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === itemId ? { ...i, qty: i.qty + 1 } : i
      ),
    })),

  decrementQty: (itemId) => {
    const item = get().items.find((i) => i.id === itemId)
    if (!item) return
    if (item.qty <= 1) {
      set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }))
    } else {
      set((state) => ({
        items: state.items.map((i) =>
          i.id === itemId ? { ...i, qty: i.qty - 1 } : i
        ),
      }))
    }
  },

  setTableId: (tableId) => set({ tableId }),
  setCustomerName: (customerName) => set({ customerName }),

  clearCart: () => set({ items: [], tableId: '', customerName: '' }),

  getTotal: () =>
    get().items.reduce((sum, i) => sum + i.price * i.qty, 0),

  getItemCount: () =>
    get().items.reduce((sum, i) => sum + i.qty, 0),

  isValid: () => {
    const { items, tableId, customerName } = get()
    return items.length > 0 && (tableId.trim() !== '' || customerName.trim() !== '')
  },
}))
