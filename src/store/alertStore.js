// RF-13: Alerta cuando item_excluded afecta un pedido pendiente
import { create } from 'zustand'

let alertIdCounter = 0

export const useAlertStore = create((set) => ({
  alerts: [],

  addAlert: ({ type, message, duration = 5000 }) => {
    const id = ++alertIdCounter
    set((state) => ({ alerts: [...state.alerts, { id, type, message }] }))
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) }))
      }, duration)
    }
    return id
  },

  removeAlert: (id) =>
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

  clearAll: () => set({ alerts: [] }),
}))
