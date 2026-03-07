import axios, { AxiosInstance } from 'axios'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { useAuthStore } from '@store/authStore'

const resolveApiBaseUrl = () => {
  const configured = (import.meta.env.VITE_API_URL || '').trim()
  const mobileConfigured = (import.meta.env.VITE_MOBILE_API_URL || '').trim()
  const isNative = Capacitor.getPlatform() !== 'web'
  const isValidNativeApiUrl = (value: string) => {
    if (!/^https:\/\//i.test(value)) return false
    try {
      const url = new URL(value)
      const isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || isIpHost) return false
      return true
    } catch {
      return false
    }
  }

  if (isNative) {
    // Native apps cannot rely on relative paths like '/api'.
    if (isValidNativeApiUrl(mobileConfigured)) return mobileConfigured
    if (isValidNativeApiUrl(configured)) return configured
    return 'https://ellosocial.com/api'
  }

  // In browser-based local/dev usage, always force same-origin proxy
  // to avoid CORS drift like http://localhost/notifications.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return '/api'
    }
  }

  if (!configured) return '/api'

  // Guard against incomplete localhost values from env like http://localhost.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(configured)) {
    return '/api'
  }

  return configured
}

const API_BASE_URL = resolveApiBaseUrl()
export const RESOLVED_API_BASE_URL = API_BASE_URL

const NATIVE_BASE_CANDIDATES = Array.from(
  new Set([
    API_BASE_URL,
    'https://ellosocial.com/api',
    'https://www.ellosocial.com/api',
  ])
)

const normalizeResponseData = <T>(value: any): T => {
  if (value && typeof value === 'object' && 'data' in value) {
    return (value as { data: T }).data
  }
  return value as T
}

const nativeHttpRequest = async <T>(
  method: 'GET' | 'POST',
  path: string,
  data?: any,
  baseOverride?: string
): Promise<T> => {
  const base = (baseOverride || API_BASE_URL).replace(/\/+$/, '')
  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  const url = `${base}${normalizedPath}`
  const state = useAuthStore.getState()
  const authToken = state.token
  const getHeaders: Record<string, string> = {
    Accept: 'application/json',
  }
  const postHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  if (authToken) {
    const authValue = `Bearer ${authToken}`
    getHeaders.Authorization = authValue
    postHeaders.Authorization = authValue
  }

  const response = method === 'GET'
    ? await CapacitorHttp.get({
        url,
        headers: getHeaders,
      })
    : await CapacitorHttp.post({
        url,
        headers: postHeaders,
        data,
      })

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} on ${path || '/'}`)
  }

  return response.data as T
}

const nativeProbeGet = async <T>(path: string): Promise<T> => {
  const errors: string[] = []

  for (const base of NATIVE_BASE_CANDIDATES) {
    try {
      return await nativeHttpRequest<T>('GET', path, undefined, base)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push(`${base}${path || '/'} -> ${msg}`)
    }
  }

  throw new Error(`Native probe failed: ${errors.join(' | ')}`)
}

const runNativeFromAxiosConfig = async (config: any): Promise<any> => {
  const method = String(config?.method || 'get').toLowerCase()
  const base = String(config?.baseURL || API_BASE_URL || '').replace(/\/+$/, '')
  const rawUrl = String(config?.url || '')
  const url = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : `${base}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`

  const state = useAuthStore.getState()
  const token = state.token
  const mergedHeaders: Record<string, string> = {
    Accept: 'application/json',
  }

  const configHeaders = config?.headers || {}
  for (const key of Object.keys(configHeaders)) {
    const value = configHeaders[key]
    if (typeof value === 'string') {
      mergedHeaders[key] = value
    }
  }

  if (token && !mergedHeaders.Authorization) {
    mergedHeaders.Authorization = `Bearer ${token}`
  }

  // Keep multipart on axios only; native plugin expects different payload handling.
  if (/multipart\/form-data/i.test(String(mergedHeaders['Content-Type'] || ''))) {
    throw new Error('Native retry skipped for multipart request')
  }

  let requestData: any = config?.data
  if (typeof requestData === 'string') {
    try {
      requestData = JSON.parse(requestData)
    } catch {
      // Keep raw string payload when not valid JSON.
    }
  }

  const options = {
    url,
    headers: mergedHeaders,
    data: requestData,
  }

  switch (method) {
    case 'get':
      return CapacitorHttp.get({ url, headers: mergedHeaders })
    case 'post':
      return CapacitorHttp.post(options)
    case 'put':
      return CapacitorHttp.put(options)
    case 'patch':
      return CapacitorHttp.patch(options)
    case 'delete':
      return CapacitorHttp.delete(options)
    default:
      throw new Error(`Unsupported native retry method: ${method}`)
  }
}

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
  async (error) => {
    // Global native fallback for WebView/network failures across all pages.
    if (Capacitor.getPlatform() !== 'web' && !error?.response && error?.config) {
      try {
        const nativeResponse = await runNativeFromAxiosConfig(error.config)
        return {
          data: nativeResponse.data,
          status: nativeResponse.status,
          statusText: '',
          headers: nativeResponse.headers || {},
          config: error.config,
          request: null,
        }
      } catch (nativeRetryError) {
        const originalMessage = error?.message || 'Network error'
        const retryMessage = nativeRetryError instanceof Error ? nativeRetryError.message : String(nativeRetryError)
        return Promise.reject(new Error(`${originalMessage} | Native retry failed: ${retryMessage}`))
      }
    }

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
  updateMoment: (momentId: string | number, content: string) => Promise<any>
  deleteMoment: (momentId: string | number) => Promise<any>
  toggleContentLike: (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number) => Promise<any>
  addContentComment: (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number, text: string, parentCommentId?: number | null) => Promise<any>
  getContentComments: (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number) => Promise<any>
  shareContent: (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number) => Promise<any>
  likeMoment: (momentId: string | number) => Promise<any>
  unlikeMoment: (momentId: string | number) => Promise<any>
  getVibes: (page?: number, limit?: number) => Promise<any>
  createVibe: (data: any) => Promise<any>
  updateVibe: (vibeId: string | number, caption: string) => Promise<any>
  deleteVibe: (vibeId: string | number) => Promise<any>
  getStories: () => Promise<any>
  createStory: (data: any) => Promise<any>
  updateStory: (storyId: string | number, text: string) => Promise<any>
  deleteStory: (storyId: string | number) => Promise<any>
  updateComment: (commentId: string | number, text: string) => Promise<any>
  deleteComment: (commentId: string | number) => Promise<any>
  updateProfile: (data: any) => Promise<any>
  getUser: (userId: string | number) => Promise<any>
  searchUsers: (query: string) => Promise<any>
  followUser: (userId: string | number) => Promise<any>
  unfollowUser: (userId: string | number) => Promise<any>
  getFollowers: (userId: string | number) => Promise<any>
  getFollowing: (userId: string | number) => Promise<any>
  getNotifications: (page?: number, limit?: number) => Promise<any>
  markNotificationAsRead: (notificationId: string | number) => Promise<any>
  markAllNotificationsAsRead: () => Promise<any>
  getConversations: (page?: number, limit?: number) => Promise<any>
  deleteConversation: (conversationId: string | number) => Promise<any>
  blockUser: (userId: string | number) => Promise<any>
  getMessages: (userId: string | number, page?: number, limit?: number) => Promise<any>
  sendMessage: (userId: string | number, content: string) => Promise<any>
  sendAudio: (data: any) => Promise<any>
  sendMedia: (data: any) => Promise<any>
  sendLocation: (data: any) => Promise<any>
  markMessageAsRead: (messageId: string | number) => Promise<any>
  reactToMessage: (messageId: string | number, reaction: string) => Promise<any>
  getMessageReactions: (messageId: string | number) => Promise<any>
  forwardMessage: (messageId: string | number, receiverId: string | number) => Promise<any>
  updateMessage: (messageId: string | number, content: string) => Promise<any>
  deleteMessage: (messageId: string | number) => Promise<any>
  getNearbyUsers: (radiusKm?: number) => Promise<any>
  getNearbyPlaces: (radiusKm?: number) => Promise<any>
  getNearbyFavorites: () => Promise<any>
  addNearbyFavorite: (userId: string | number) => Promise<any>
  removeNearbyFavorite: (userId: string | number) => Promise<any>
  toggleNearbyVisibility: (isVisible: boolean) => Promise<any>
  updateUserLocation: (latitude: number, longitude: number) => Promise<any>
  markOnline: () => Promise<any>
  markOffline: () => Promise<any>
  markActivity: () => Promise<any>
  getMusicFeed: (page?: number, limit?: number) => Promise<any>
  uploadMusic: (data: { title: string; artist: string; audio_url: string; album_cover?: string | null }) => Promise<any>
  getMusicFavorites: (userId: string | number) => Promise<any>
  addMusicFavorite: (musicId: string | number) => Promise<any>
  removeMusicFavorite: (musicId: string | number) => Promise<any>
  updateMusic: (musicId: string | number, data: { title: string; artist: string }) => Promise<any>
  deleteMusic: (musicId: string | number) => Promise<any>
  shareMusicToChat: (receiverId: string | number, musicId: string | number) => Promise<any>
  uploadFile: (file: File, context?: 'moment' | 'vibe' | 'story') => Promise<any>
  logoutUser: () => void
}

// Health check
api.getHealth = async () => {
  try {
    const response = await apiClient.get('/health')
    return normalizeResponseData(response)
  } catch (error) {
    if (Capacitor.getPlatform() !== 'web') {
      return nativeProbeGet('/health')
    }
    throw error
  }
}

// App info
api.getAppInfo = async () => {
  try {
    // Use API base path instead of domain root to keep CORS headers in native apps.
    const response = await apiClient.get('')
    return normalizeResponseData(response)
  } catch (error) {
    if (Capacitor.getPlatform() !== 'web') {
      return nativeProbeGet('')
    }
    throw error
  }
}

// Register
api.register = async (data: RegisterRequest) => {
  try {
    const response = await apiClient.post('/auth/register', data)
    return normalizeResponseData(response)
  } catch (error) {
    if (Capacitor.getPlatform() !== 'web') {
      return nativeHttpRequest('POST', '/auth/register', data)
    }
    throw error
  }
}

// Login
api.login = async (email: string, password: string) => {
  const identifier = email.trim()
  const isEmailIdentifier = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
  const payload = {
    identifier,
    ...(isEmailIdentifier ? { email: identifier } : {}),
    password: password,
  }

  try {
    const response = await apiClient.post('/auth/login', payload)
    return normalizeResponseData(response)
  } catch (error) {
    if (Capacitor.getPlatform() !== 'web') {
      return nativeHttpRequest('POST', '/auth/login', payload)
    }
    throw error
  }
}

// Get current user
api.getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/users/me')
    return normalizeResponseData(response)
  } catch (error) {
    if (Capacitor.getPlatform() !== 'web') {
      return nativeHttpRequest('GET', '/users/me')
    }
    throw error
  }
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
  return apiClient.post('/moments/', data)
}

api.updateMoment = async (momentId: string | number, content: string) => {
  return apiClient.patch(`/moments/${momentId}`, { content })
}

api.deleteMoment = async (momentId: string | number) => {
  return apiClient.delete(`/moments/${momentId}`)
}

api.toggleContentLike = async (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number) => {
  return apiClient.post(`/social/like/${contentType}/${contentId}`)
}

api.addContentComment = async (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number, text: string, parentCommentId: number | null = null) => {
  return apiClient.post(`/social/comment/${contentType}/${contentId}`, {
    text,
    parent_comment_id: parentCommentId,
  })
}

api.getContentComments = async (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number) => {
  return apiClient.get(`/social/comments/${contentType}/${contentId}`)
}

api.shareContent = async (contentType: 'moment' | 'vibe' | 'story' | 'comment', contentId: string | number) => {
  return apiClient.post(`/social/share/${contentType}/${contentId}`)
}

api.likeMoment = async (momentId: string | number) => {
  return apiClient.post(`/moments/${momentId}/like`)
}

api.unlikeMoment = async (momentId: string | number) => {
  return apiClient.delete(`/moments/${momentId}/like`)
}

api.getVibes = async (page = 1, limit = 10) => {
  return apiClient.get(`/vibes/?page=${page}&limit=${limit}`)
}

api.createVibe = async (data: any) => {
  return apiClient.post('/vibes/', data)
}

api.updateVibe = async (vibeId: string | number, caption: string) => {
  return apiClient.patch(`/vibes/${vibeId}`, { caption })
}

api.deleteVibe = async (vibeId: string | number) => {
  return apiClient.delete(`/vibes/${vibeId}`)
}

api.getStories = async () => {
  return apiClient.get('/stories/')
}

api.createStory = async (data: any) => {
  return apiClient.post('/stories/', data)
}

api.updateStory = async (storyId: string | number, text: string) => {
  return apiClient.patch(`/stories/${storyId}`, { text })
}

api.deleteStory = async (storyId: string | number) => {
  return apiClient.delete(`/stories/${storyId}`)
}

api.updateComment = async (commentId: string | number, text: string) => {
  return apiClient.patch(`/social/comment/${commentId}`, { text })
}

api.deleteComment = async (commentId: string | number) => {
  return apiClient.delete(`/social/comment/${commentId}`)
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
  // Use trailing slash to avoid FastAPI 307 redirect that can break proxy flows.
  return apiClient.get(`/notifications/?page=${page}&limit=${limit}`)
}

api.markNotificationAsRead = async (notificationId: string | number) => {
  return apiClient.put(`/notifications/${notificationId}/read`)
}

api.markAllNotificationsAsRead = async () => {
  return apiClient.put('/notifications/read-all')
}

api.getConversations = async (page = 1, limit = 20) => {
  return apiClient.get(`/chat/conversations?page=${page}&limit=${limit}`)
}

api.deleteConversation = async (conversationId: string | number) => {
  return apiClient.delete(`/chat/conversation/${conversationId}`)
}

api.blockUser = async (userId: string | number) => {
  return apiClient.post(`/chat/block/${userId}`)
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

api.updateMessage = async (messageId: string | number, content: string) => {
  return apiClient.patch(`/chat/message/${messageId}`, { content })
}

api.deleteMessage = async (messageId: string | number) => {
  return apiClient.delete(`/chat/message/${messageId}`)
}

api.getNearbyUsers = async (radiusKm: number = 5) => {
  return apiClient.get(`/nearby/?radius_km=${radiusKm}`)
}

api.getNearbyPlaces = async (radiusKm: number = 5) => {
  return apiClient.get(`/nearby/places?radius_km=${radiusKm}`)
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

api.getMusicFeed = async (page = 1, limit = 20) => {
  return apiClient.get(`/music/?page=${page}&limit=${limit}`)
}

api.uploadMusic = async (data: { title: string; artist: string; audio_url: string; album_cover?: string | null }) => {
  return apiClient.post('/music/', data)
}

api.getMusicFavorites = async (userId: string | number) => {
  return apiClient.get(`/music/favorites/${userId}`)
}

api.addMusicFavorite = async (musicId: string | number) => {
  return apiClient.post('/music/favorites/', { music_id: Number(musicId) })
}

api.removeMusicFavorite = async (musicId: string | number) => {
  return apiClient.delete(`/music/favorites/${musicId}`)
}

api.updateMusic = async (musicId: string | number, data: { title: string; artist: string }) => {
  return apiClient.patch(`/music/${musicId}`, data)
}

api.deleteMusic = async (musicId: string | number) => {
  return apiClient.delete(`/music/${musicId}`)
}

api.shareMusicToChat = async (receiverId: string | number, musicId: string | number) => {
  return apiClient.post('/chat/share-music', {
    receiver_id: Number(receiverId),
    music_id: Number(musicId),
  })
}

api.uploadFile = async (file: File, context?: 'moment' | 'vibe' | 'story') => {
  const formData = new FormData()
  formData.append('file', file)
  if (context) {
    formData.append('context', context)
  }
  return apiClient.post('/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  })
}

export const apiService = {
  getHealth: () => api.getHealth(),
  getAppInfo: () => api.getAppInfo(),
}

export default api
