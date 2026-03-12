self.addEventListener('push', (event) => {
  let payload = {}
  if (event.data) {
    try {
      payload = event.data.json()
    } catch (_) {
      payload = { body: event.data.text() }
    }
  }

  const title = String(payload.title || 'Ello')
  const body = String(payload.body || 'Nova notificacao')
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {}

  const notificationOptions = {
    body,
    icon: '/favicon.png',
    badge: '/favicon.png',
    data,
  }

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions).then(() =>
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: 'ello:web-push-received',
            payload: {
              title,
              body,
              data,
            },
          })
        }
      })
    )
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const payload = event.notification.data || {}
  const targetPath = typeof payload.path === 'string' && payload.path ? payload.path : '/notifications'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client && typeof client.navigate === 'function') {
            client.navigate(targetPath)
          }
          return
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath)
      }
      return undefined
    })
  )
})
