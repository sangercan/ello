import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ellosocial.app',
  appName: 'Ello Social',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
