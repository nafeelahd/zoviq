'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

type Notification = { id: string; type: string; read: boolean; created_at: string; actor_id: string; post_id: string | null; group_id: string | null; actor_username?: string }

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      fetchNotifications(data.session.user.id)
    })
  }, [])

  const fetchNotifications = async (uid: string) => {
    const supabase = createClient()
    const { data } = await supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    if (!data || data.length === 0) { setNotifications([]); setLoading(false); return }
    const actorIds = [...new Set(data.map(n => n.actor_id))]
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', actorIds)
    const usernameMap: Record<string, string> = {}
    profiles?.forEach(p => { usernameMap[p.id] = p.username })
    setNotifications(data.map(n => ({ ...n, actor_username: usernameMap[n.actor_id] || 'Someone' })))
    await supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false)
    setLoading(false)
  }

  const getIcon = (type: string) => {
    const icons: Record<string, string> = { like: '❤️', comment: '💬', follow: '👤', message: '✉️', group_message: '👥', group_request: '🔔', group_join: '✅', group_accepted: '🎉', group_added: '➕', group_removed: '❌', video_call: '📹', audio_call: '📞' }
    return icons[type] || '🔔'
  }

  const getMessage = (type: string) => {
    const msgs: Record<string, string> = { like: 'liked your post', comment: 'commented on your post', follow: 'started following you', message: 'sent you a message', group_message: 'sent a message in your group', group_request: 'requested to join your group', group_join: 'joined your group', group_accepted: 'accepted your group request', group_added: 'added you to a group', group_removed: 'removed you from a group', video_call: 'started a video call with you', audio_call: 'called you' }
    return msgs[type] || 'sent you a notification'
  }

  const getLink = (n: Notification) => {
    if (n.type === 'message' || n.type === 'audio_call' || n.type === 'video_call') return '/messages'
    if (n.type === 'like' || n.type === 'comment') return '/feed'
    if (n.type === 'follow') return '/people'
    if (n.group_id) return `/groups?id=${n.group_id}`
    return '/feed'
  }

  const timeAgo = (date: string) => {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  const unread = notifications.filter(n => !n.read)
  const read = notifications.filter(n => n.read)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="notifications" />
      <main className="max-w-xl mx-auto py-6 px-4">
        <h1 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Notifications</h1>

        {loading ? (
          <div className="text-center py-16"><div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-4xl mb-3">🔔</p>
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No notifications yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>When someone interacts with you, you'll see it here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {unread.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--muted)' }}>New</p>
                <div className="space-y-1.5">
                  {unread.map(n => (
                    <a key={n.id} href={getLink(n)}
                      className="flex items-center gap-3 p-4 rounded-2xl border shadow-sm transition hover:shadow-md cursor-pointer"
                      style={{ background: '#EEF2FF', borderColor: '#C7D2FE' }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                        {(n.actor_username || 'S')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: 'var(--text)' }}>
                          <span className="font-semibold">{n.actor_username}</span> {getMessage(n.type)}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: '#6366F1' }}>{timeAgo(n.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getIcon(n.type)}</span>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#6366F1' }} />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {read.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--muted)' }}>Earlier</p>
                <div className="space-y-1.5">
                  {read.map(n => (
                    <a key={n.id} href={getLink(n)}
                      className="flex items-center gap-3 p-4 rounded-2xl border shadow-sm transition hover:shadow-md cursor-pointer"
                      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                        {(n.actor_username || 'S')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: 'var(--text)' }}>
                          <span className="font-semibold">{n.actor_username}</span> {getMessage(n.type)}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{timeAgo(n.created_at)}</p>
                      </div>
                      <span className="text-lg flex-shrink-0">{getIcon(n.type)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}