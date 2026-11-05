'use client'

import { useEffect, useState } from 'react'

function decodeVapidKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

export default function PushNotifications() {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return

    setSupported(true)
    navigator.serviceWorker.ready.then(registration => registration.pushManager.getSubscription())
      .then(subscription => { if (active) setEnabled(Boolean(subscription)) })
      .catch(error => console.error('Could not check push subscription:', error))

    return () => { active = false }
  }, [])

  const toggle = async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!supported || !publicKey || loading) return

    setLoading(true)
    setMessage('')
    try {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        const response = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        })
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          throw new Error(result.error || 'Could not disable push notifications')
        }
        await existing.unsubscribe()
        setEnabled(false)
        setMessage('Push notifications are off.')
      } else {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') throw new Error('Allow notifications in your browser to enable push alerts.')

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(publicKey),
        })
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        })
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          await subscription.unsubscribe()
          throw new Error(result.error || 'Could not enable push notifications')
        }
        setEnabled(true)
        setMessage('Push notifications are on.')
      }
    } catch (error) {
      console.error('Could not update push notifications:', error)
      setMessage(error instanceof Error ? error.message : 'Could not update push notifications')
    } finally {
      setLoading(false)
    }
  }

  if (!supported) return <p className="px-4 py-2 text-xs" style={{ color: 'var(--muted)' }}>Push notifications are not supported in this browser.</p>
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return <p className="px-4 py-2 text-xs" style={{ color: 'var(--muted)' }}>Push notifications need VAPID keys in the app configuration.</p>

  return (
    <div className="px-2 py-2">
      <button className="menu-item rounded-xl" onClick={() => void toggle()} disabled={loading}>
        <span aria-hidden="true">{enabled ? '🔔' : '🔕'}</span>
        {loading ? 'Updating…' : enabled ? 'Turn off push notifications' : 'Turn on push notifications'}
      </button>
      {message && <p role="status" className="px-3 pt-1 text-xs" style={{ color: 'var(--muted)' }}>{message}</p>}
    </div>
  )
}
