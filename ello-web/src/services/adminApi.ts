import axios from 'axios'
import { RESOLVED_API_BASE_URL } from '@services/api'

export interface AdminTokenResponse {
  access_token: string
  token_type: string
  user_id: number
  username: string
}

export interface AdminUser {
  id: number
  full_name: string
  username: string
  email: string
  is_panel_admin: boolean
  is_panel_active: boolean
  created_at: string
}

export interface AdminMetrics {
  summary: {
    total_users: number
    online_users: number
    new_users_24h: number
    new_users_7d: number
    content_24h: number
    messages_24h: number
    active_users_24h: number
    total_panel_users: number
  }
  traffic_24h: Array<{ hour: string; events: number }>
  peak_hour?: { hour: string; events: number } | null
  tension_points: Array<{ hour: string; events: number }>
}

const adminApi = axios.create({
  baseURL: RESOLVED_API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

adminApi.interceptors.request.use((config) => {
  const raw = localStorage.getItem('admin-auth-storage')
  if (!raw) return config

  try {
    const parsed = JSON.parse(raw)
    const token = parsed?.state?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Ignore malformed persisted data and continue without token.
  }

  return config
})

export const adminService = {
  async login(username: string, password: string): Promise<AdminTokenResponse> {
    const response = await adminApi.post('/admin/login', { username, password })
    return response.data
  },

  async me(): Promise<AdminUser> {
    const response = await adminApi.get('/admin/me')
    return response.data
  },

  async metrics(): Promise<AdminMetrics> {
    const response = await adminApi.get('/admin/metrics')
    return response.data
  },

  async listPanelUsers(onlyPanelUsers = true): Promise<AdminUser[]> {
    const response = await adminApi.get('/admin/users', {
      params: { only_panel_users: onlyPanelUsers },
    })
    return response.data
  },

  async createPanelUser(payload: {
    full_name: string
    username: string
    email: string
    password: string
    is_panel_admin: boolean
    is_panel_active: boolean
  }): Promise<AdminUser> {
    const response = await adminApi.post('/admin/users', payload)
    return response.data
  },

  async updatePanelUser(
    userId: number,
    payload: {
      full_name?: string
      email?: string
      password?: string
      is_panel_admin?: boolean
      is_panel_active?: boolean
    }
  ): Promise<AdminUser> {
    const response = await adminApi.put(`/admin/users/${userId}`, payload)
    return response.data
  },
}
