self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())
self.addEventListener('push', event => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Zoviq', body: event.data?.text() || 'You have a new notification.' }
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Zoviq', {
    body: payload.body || 'You have a new notification.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/notifications' },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const requestedUrl = new URL(event.notification.data?.url || '/notifications', self.location.origin)
  const url = (requestedUrl.origin === self.location.origin ? requestedUrl : new URL('/notifications', self.location.origin)).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const client = clients.find(windowClient => windowClient.url.startsWith(self.location.origin))
    if (client) {
      void client.navigate(url)
      return client.focus()
    }
    return self.clients.openWindow(url)
  }))
})
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
})