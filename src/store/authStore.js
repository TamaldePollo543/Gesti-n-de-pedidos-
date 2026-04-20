import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      waiter: null,
      isAuthenticated: false,

      login: (token, waiter, session = {}) =>
        set({
          token,
          waiter,
          refreshToken: session.refreshToken || null,
          tokenExpiresAt: session.expiresIn
            ? Date.now() + Number(session.expiresIn) * 1000
            : null,
          isAuthenticated: true,
        }),

      setSessionTokens: (token, refreshToken, expiresIn) =>
        set((state) => ({
          ...state,
          token,
          refreshToken: refreshToken || state.refreshToken,
          tokenExpiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : state.tokenExpiresAt,
          isAuthenticated: true,
        })),

      logout: () =>
        set({ token: null, refreshToken: null, tokenExpiresAt: null, waiter: null, isAuthenticated: false }),
    }),
    {
      name: 'mesa-plus-auth',
      // Solo persistir token + mesero, no estados derivados
      partialize: (s) => ({
        token: s.token,
        refreshToken: s.refreshToken,
        tokenExpiresAt: s.tokenExpiresAt,
        waiter: s.waiter,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
)
