# Appflow Release (Android/iOS)

## 1) Prerequisites

- Project connected to GitHub
- Ionic Appflow app linked to this repository/branch
- Firebase configured for Android (`google-services.json`) and iOS (`GoogleService-Info.plist`)

## 2) Mobile sync

From `ello-web`:

```bash
npm install
npm run build
npx cap sync
```

## 3) Commit for Appflow

Commit these files whenever push/mobile config changes:

- `ello-web/capacitor.config.ts`
- `ello-web/ionic.config.json`
- `ello-web/package.json`
- `ello-web/package-lock.json`
- `ello-web/src/services/pushNotifications.ts`
- `ello-web/src/services/api.ts`
- `ello-web/src/App.tsx`
- `ello-web/src/store/authStore.ts`

## 4) Appflow Build

In Appflow:

1. Choose branch with commit.
2. Start Android build.
3. Start iOS build.
4. Use same commit hash for both platforms.

## 5) Notes

- Web browser currently receives realtime updates via WebSocket while app is open.
- Native push notifications are handled by Capacitor + FCM/APNs.
