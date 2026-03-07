// User types
export interface User {
  id: number
  full_name: string
  username: string
  email: string
  avatar_url?: string
  bio?: string
  link?: string
  location?: string
  category?: string
  is_online: boolean
  is_visible_nearby: boolean
  created_at: string
}

// Auth response
export interface AuthResponse {
  access_token: string
  token_type: string
  user?: User
}

// Moment types
export interface Moment {
  id: number
  author_id: number
  author: User
  content: string
  media_url?: string
  latitude?: number | null
  longitude?: number | null
  location_label?: string | null
  likes_count: number
  comments_count: number
  is_liked: boolean
  created_at: string
}

// Vibe types
export interface Vibe {
  id: number
  author_id: number
  author: User
  title: string
  description?: string
  video_url: string
  likes_count: number
  comments_count: number
  is_liked: boolean
  created_at: string
}

// Story types
export interface Story {
  id: number
  user_id: number
  author?: User
  media_url: string
  text?: string
  likes_count?: number
  is_liked?: boolean
  expires_at: string
  created_at: string
}

// Message types
export interface Message {
  id: number
  sender_id: number
  recipient_id: number
  content: string
  is_read: boolean
  created_at: string
}

// Notification types
export interface Notification {
  id: number
  user_id: number
  type: string // 'like', 'comment', 'follow', 'message'
  actor_id: number
  actor: User
  target_id?: number
  content: string
  is_read: boolean
  created_at: string
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  has_next: boolean
}
