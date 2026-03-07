import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'
import apiClient from '@services/api'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (data: {
    full_name: string
    username: string
    email: string
    password: string
  }) => Promise<void>
  logout: () => void
  updateUser: (user: User) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      initialize: async () => {
        // Token is loaded from localStorage via persist
        const state = get()
        if (state.token) {
          try {
            set({ isLoading: true })
            // Interceptor will automatically add token from Zustand state
            const user = await apiClient.getCurrentUser()
            set({ user, isAuthenticated: true, isLoading: false })
          } catch (error) {
            console.error('Initialize error:', error)
            set({ token: null, isAuthenticated: false, user: null, isLoading: false })
          }
        } else {
          set({ isLoading: false })
        }
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          console.log('🔐 Iniciando login com:', email)
          
          // Send only identifier, not email field to avoid validation issues
          const loginData = await apiClient.login(email.trim(), password)
          
          console.log('✅ Resposta do login:', loginData)
          
          const { access_token } = loginData
          
          if (!access_token) {
            throw new Error('Nenhum token recebido do servidor')
          }
          
          console.log('💾 Salvando token...')
          
          // Save token to state (interceptor will use it)
          set({ token: access_token })
          
          // Wait a bit to ensure state is updated
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Set token directly in axios headers for immediate use
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
          
          // Get user data - token is now available in interceptor
          console.log('👤 Buscando dados do usuário...')
          const user = await apiClient.getCurrentUser()
          
          console.log('✅ Dados do usuário:', user)
          
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error: any) {
          console.error('❌ Erro no login:', error.response?.data || error.message)
          const message = error.response?.data?.detail || error.message || 'Erro ao fazer login'
          set({ error: message, isLoading: false, token: null, isAuthenticated: false })
          throw error
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null })
        try {
          console.log('📝 Iniciando registro com:', data.email)
          
          const registerData = await apiClient.register(data)
          
          console.log('✅ Resposta do registro:', registerData)
          
          const { access_token } = registerData
          
          if (!access_token) {
            throw new Error('Nenhum token recebido do servidor')
          }
          
          console.log('💾 Salvando token...')
          
          // Save token to state (interceptor will use it)
          set({ token: access_token })
          
          // Wait a bit to ensure state is updated
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Set token directly in axios headers for immediate use
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
          
          // Get user data - token is now available in interceptor
          console.log('👤 Buscando dados do usuário...')
          const user = await apiClient.getCurrentUser()
          
          console.log('✅ Dados do usuário:', user)
          
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (error: any) {
          console.error('❌ Erro no registro:', error.response?.data || error.message)
          const message = error.response?.data?.detail || error.message || 'Erro ao cadastrar'
          set({ error: message, isLoading: false, token: null, isAuthenticated: false })
          throw error
        }
      },

      logout: () => {
        // Mark user as offline and hide from nearby before logout
        console.log('[AuthStore] 👋 Logout - marcando como oculto e offline...')
        apiClient.markOffline().catch(err => {
          console.error('[AuthStore] Erro ao marcar como offline:', err)
        })
        
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        })
      },

      updateUser: (user) => {
        set({ user })
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
