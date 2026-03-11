import axios, { AxiosInstance } from 'axios'
import { useAuthStore } from '@store/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface HealthResponse {
  status: string
  service: string
  timestamp?: string
}

export interface AppInfoResponse {
  message: string
  version: string
  environment: string
}

export interface RegisterRequest {
  full_name: string
  username: string
  email: string
  password: string
}

export interface LoginRequest {
  identifier?: string
  email?: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface UserResponse {
  id: string
  username: string
  email: string
  full_name: string
  bio?: string
  avatar_url?: string
  created_at: string
}

// Request interceptor: Add token to every request
apiClient.interceptors.request.use(
  (config) => {
    const state = useAuthStore.getState()
    if (state.token) {
      config.headers.Authorization = `Bearer ${state.token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const state = useAuthStore.getState()
      state.logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Create extended API client with typed methods
const api = apiClient as AxiosInstance & {
  getHealth: () => Promise<any>
  getAppInfo: () => Promise<any>
  register: (data: RegisterRequest) => Promise<any>
  login: (email: string, password: string) => Promise<any>
  getCurrentUser: () => Promise<any>
  getMoments: (page?: number, limit?: number) => Promise<any>
  createMoment: (data: any) => Promise<any>
  likeMoment: (momentId: string | number) => Promise<any>
  unlikeMoment: (momentId: string | number) => Promise<any>
  getVibes: (page?: number, limit?: number) => Promise<any>
  createVibe: (data: any) => Promise<any>
  getStories: () => Promise<any>
  createStory: (data: any) => Promise<any>
  updateProfile: (data: any) => Promise<any>
  getUser: (userId: string | number) => Promise<any>
  searchUsers: (query: string) => Promise<any>
  followUser: (userId: string | number) => Promise<any>
  unfollowUser: (userId: string | number) => Promise<any>
  getFollowers: (userId: string | number) => Promise<any>
  getFollowing: (userId: string | number) => Promise<any>
  getNotifications: (page?: number, limit?: number) => Promise<any>
  markNotificationAsRead: (notificationId: string | number) => Promise<any>
  getConversations: (page?: number, limit?: number) => Promise<any>
  getMessages: (userId: string | number, page?: number, limit?: number) => Promise<any>
  sendMessage: (userId: string | number, content: string) => Promise<any>
  sendAudio: (data: any) => Promise<any>
  sendMedia: (data: any) => Promise<any>
  sendLocation: (data: any) => Promise<any>
  markMessageAsRead: (messageId: string | number) => Promise<any>
  reactToMessage: (messageId: string | number, reaction: string) => Promise<any>
  getMessageReactions: (messageId: string | number) => Promise<any>
  forwardMessage: (messageId: string | number, receiverId: string | number) => Promise<any>
  getNearbyUsers: (radiusKm?: number) => Promise<any>
  getNearbyFavorites: () => Promise<any>
  addNearbyFavorite: (userId: string | number) => Promise<any>
  removeNearbyFavorite: (userId: string | number) => Promise<any>
  toggleNearbyVisibility: (isVisible: boolean) => Promise<any>
  updateUserLocation: (latitude: number, longitude: number) => Promise<any>
  markOnline: () => Promise<any>
  markOffline: () => Promise<any>
  markActivity: () => Promise<any>
  uploadFile: (file: File) => Promise<any>
  logoutUser: () => void
}

// Health check
api.getHealth = async () => {
  return apiClient.get('/health')
}

// App info
api.getAppInfo = async () => {
  return apiClient.get('/')
}

// Register
api.register = async (data: RegisterRequest) => {
  return apiClient.post('/auth/register', data)
}

// Login
api.login = async (email: string, password: string) => {
  return apiClient.post('/auth/login', {
    identifier: email,
    email: email,
    password: password,
  })
}

// Get current user
api.getCurrentUser = async () => {
  return apiClient.get('/users/me')
}

// Logout
api.logoutUser = () => {
  localStorage.removeItem('auth-storage')
  delete apiClient.defaults.headers.common['Authorization']
}

// Additional methods for CRUD operations
api.getMoments = async (page = 1, limit = 10) => {
  return apiClient.get(`/moments?page=${page}&limit=${limit}`)
}

api.createMoment = async (data: any) => {
  return apiClient.post('/moments', data)
}

api.likeMoment = async (momentId: string | number) => {
  return apiClient.post(`/moments/${momentId}/like`)
}

api.unlikeMoment = async (momentId: string | number) => {
  return apiClient.delete(`/moments/${momentId}/like`)
}

api.getVibes = async (page = 1, limit = 10) => {
  return apiClient.get(`/vibes?page=${page}&limit=${limit}`)
}

api.createVibe = async (data: any) => {
  return apiClient.post('/vibes', data)
}

api.getStories = async () => {
  return apiClient.get('/stories')
}

api.createStory = async (data: any) => {
  return apiClient.post('/stories', data)
}

api.updateProfile = async (data: any) => {
  return apiClient.put('/users/me', data)
}

api.getUser = async (userId: string | number) => {
  return apiClient.get(`/users/${userId}`)
}

api.searchUsers = async (query: string) => {
  return apiClient.get(`/users/search?q=${query}`)
}

api.followUser = async (userId: string | number) => {
  return apiClient.post(`/social/${userId}/follow`)
}

api.unfollowUser = async (userId: string | number) => {
  return apiClient.delete(`/social/${userId}/follow`)
}

api.getFollowers = async (userId: string | number) => {
  return apiClient.get(`/users/${userId}/followers`)
}

api.getFollowing = async (userId: string | number) => {
  return apiClient.get(`/users/${userId}/following`)
}

api.getNotifications = async (page = 1, limit = 20) => {
  return apiClient.get(`/notifications?page=${page}&limit=${limit}`)
}

api.markNotificationAsRead = async (notificationId: string | number) => {
  return apiClient.put(`/notifications/${notificationId}/read`)
}

api.getConversations = async (page = 1, limit = 20) => {
  return apiClient.get(`/chat/conversations?page=${page}&limit=${limit}`)
}

api.getMessages = async (userId: string | number, page = 1, limit = 50) => {
  return apiClient.get(`/chat/messages/${userId}?page=${page}&limit=${limit}`)
}

api.sendMessage = async (userId: string | number, content: string) => {
  return apiClient.post(`/chat/send`, { receiver_id: parseInt(userId.toString()), content })
}

api.sendAudio = async (data: any) => {
  return apiClient.post(`/chat/audio`, data)
}

api.sendMedia = async (data: any) => {
  return apiClient.post(`/chat/media`, data)
}

api.sendLocation = async (data: any) => {
  return apiClient.post(`/chat/location`, data)
}

api.markMessageAsRead = async (messageId: string | number) => {
  return apiClient.post(`/chat/messages/${messageId}/read`)
}

api.reactToMessage = async (messageId: string | number, reaction: string) => {
  return apiClient.post(`/chat/message/${messageId}/reaction?reaction=${encodeURIComponent(reaction)}`)
}

api.getMessageReactions = async (messageId: string | number) => {
  return apiClient.get(`/chat/message/${messageId}/reactions`)
}

api.forwardMessage = async (messageId: string | number, receiverId: string | number) => {
  return apiClient.post(`/chat/message/${messageId}/forward`, { receiver_id: Number(receiverId) })
}

api.getNearbyUsers = async (radiusKm: number = 5) => {
  return apiClient.get(`/nearby?radius_km=${radiusKm}`)
}

api.getNearbyFavorites = async () => {
  return apiClient.get('/nearby/favorites')
}

api.addNearbyFavorite = async (userId: string | number) => {
  return apiClient.post(`/nearby/favorites/${userId}`)
}

api.removeNearbyFavorite = async (userId: string | number) => {
  return apiClient.delete(`/nearby/favorites/${userId}`)
}

api.toggleNearbyVisibility = async (isVisible: boolean) => {
  return apiClient.patch('/nearby/visibility', { is_visible: isVisible })
}

api.updateUserLocation = async (latitude: number, longitude: number) => {
  return apiClient.patch('/nearby/location', { latitude, longitude })
}

api.markOnline = async () => {
  return apiClient.post('/users/online')
}

api.markOffline = async () => {
  return apiClient.post('/users/offline')
}

api.markActivity = async () => {
  return apiClient.post('/users/activity')
}

api.uploadFile = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiClient.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const apiService = {
  getHealth: () => api.getHealth(),
  getAppInfo: () => api.getAppInfo(),
}

export default api
