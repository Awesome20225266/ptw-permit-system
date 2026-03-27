import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { UserInfo } from '@/types'

interface AuthState {
  token: string | null
  user: UserInfo | null
  isAuthenticated: boolean

  // Actions
  setToken: (token: string) => void
  setUser: (user: UserInfo) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      setToken: (token) => set({ token, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    {
      name: 'zel-eye-auth',
      storage: createJSONStorage(() => sessionStorage), // cleared on tab close
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          state.isAuthenticated = true
        }
      },
    },
  ),
)

// Selector helpers
export const useToken = () => useAuthStore((s) => s.token)
export const useUser = () => useAuthStore((s) => s.user)
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated)
export const useAllowedPages = () => useAuthStore((s) => s.user?.allowed_pages ?? [])
