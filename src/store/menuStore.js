// RF-01: Mostrar solo ítems con availability=true de la API
// RF-02: excludeItem / restoreItem llamado por el servicio de sockets en ≤2s (RNF-01)
import { create } from 'zustand'

export const useMenuStore = create((set, get) => ({
  items: [],
  categories: [],
  isLoading: false,
  error: null,
  activeCategory: 'Todos',
  searchQuery: '',

  setItems: (items) => {
    const categories = ['Todos', ...new Set(items.map((i) => i.category))]
    set({ items, categories })
  },

  upsertItem: (item) =>
    set((state) => {
      const next = [...state.items]
      const index = next.findIndex((i) => String(i.id) === String(item.id))
      if (index >= 0) {
        next[index] = { ...next[index], ...item }
      } else {
        next.unshift(item)
      }
      const categories = ['Todos', ...new Set(next.map((i) => i.category).filter(Boolean))]
      return { items: next, categories }
    }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setActiveCategory: (cat) => set({ activeCategory: cat }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  // RF-02: llamado de forma síncrona por el manejador de eventos del socket (RNF-01 ≤2s)
  excludeItem: (itemId, reason) =>
    set((state) => ({
      items: state.items.map((item) =>
        String(item.id) === String(itemId)
          ? { ...item, available: false, unavailableReason: reason || item.unavailableReason || 'Sin ingredientes' }
          : item
      ),
    })),

  // RF-02: Evento item_restored
  restoreItem: (itemId) =>
    set((state) => ({
      items: state.items.map((item) =>
        String(item.id) === String(itemId)
          ? { ...item, available: true, unavailableReason: undefined }
          : item
      ),
    })),

  // Derivado: ítems filtrados para la vista actual
  getFilteredItems: () => {
    const { items, activeCategory, searchQuery } = get()
    return items.filter((item) => {
      const catMatch = activeCategory === 'Todos' || item.category === activeCategory
      const qMatch =
        !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase())
      return catMatch && qMatch
    })
  },
}))
