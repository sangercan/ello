/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_WS_URL?: string
  readonly VITE_STUN_URL?: string
  readonly VITE_TURN_URL?: string
  readonly VITE_TURN_USER?: string
  readonly VITE_TURN_PASS?: string
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
