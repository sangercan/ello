import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { adminService, type AdminUser } from '@services/adminApi'

interface AdminAuthStore {
  token: string | null
  user: AdminUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  initialize: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const useAdminAuthStore = create<AdminAuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      initialize: async () => {
        const state = get()
        if (!state.token) return

        set({ isLoading: true, error: null })
        try {
          const user = await adminService.me()
          set({ user, isAuthenticated: true, isLoading: false })
        } catch {
          set({ token: null, user: null, isAuthenticated: false, isLoading: false })
        }
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const auth = await adminService.login(username.trim(), password)
          set({ token: auth.access_token })
          const user = await adminService.me()
          set({ user, isAuthenticated: true, isLoading: false })
        } catch (error: any) {
          const message = error?.response?.data?.detail || error?.message || 'Falha no login administrativo'
          set({ error: String(message), isLoading: false, token: null, user: null, isAuthenticated: false })
          throw error
        }
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false, error: null })
      },
    }),
    {
      name: 'admin-auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
