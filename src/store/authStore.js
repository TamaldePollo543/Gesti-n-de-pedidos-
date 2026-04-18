import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      waiter: null,
      isAuthenticated: false,

      login: (token, waiter) =>
        set({ token, waiter, isAuthenticated: true }),

      logout: () =>
        set({ token: null, waiter: null, isAuthenticated: false }),
    }),
    {
      name: 'mesa-plus-auth',
      // Solo persistir token + mesero, no estados derivados
      partialize: (s) => ({ token: s.token, waiter: s.waiter, isAuthenticated: s.isAuthenticated }),
    }
  )
)
