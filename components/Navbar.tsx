'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/lib/useTheme'
import PushNotifications from '@/components/PushNotifications'

interface NavbarProps {
  activePage?: string
}

type NavItem = { key: string; href: string; label: string; icon: string; badge?: number }

const ICONS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  people: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  groups: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  sun: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  moon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  cog: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

const Icon = ({ d, className = 'w-[22px] h-[22px]' }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const Badge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span
      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #F43F5E, #EC4899)', boxShadow: '0 0 0 2px var(--surface-solid)' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  ) : null

export default function Navbar({ activePage }: NavbarProps) {
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [unreadDMs, setUnreadDMs] = useState(0)
  const [unreadGroups, setUnreadGroups] = useState(0)
  const { darkMode, setDarkMode } = useTheme()
  const [showSettings, setShowSettings] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return
      const uid = data.session.user.id
      fetchCounts(uid)
      intervalRef.current = setInterval(() => fetchCounts(uid), 10000)
      const updatePresence = async () => {
        const { error } = await supabase.from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', uid)
        if (error) console.error('Could not update last seen:', error)
      }
      updatePresence()
      presenceIntervalRef.current = setInterval(updatePresence, 30000)
    })
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current)
    }
  }, [])

  const fetchCounts = async (uid: string) => {
    const supabase = createClient()
    const { count: notifCount } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false)
    const { count: dmCount } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', uid).eq('read', false)
    const { data: myGroups } = await supabase.from('group_members').select('group_id').eq('user_id', uid)
    let groupMsgCount = 0
    if (myGroups && myGroups.length > 0) {
      const groupIds = myGroups.map(g => g.group_id)
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase.from('group_messages').select('*', { count: 'exact', head: true }).in('group_id', groupIds).neq('user_id', uid).gte('created_at', since)
      groupMsgCount = count || 0
    }
    setUnreadNotifs(notifCount || 0)
    setUnreadDMs(dmCount || 0)
    setUnreadGroups(groupMsgCount)
  }

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const deleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDeleting(false); return }
    const uid = session.user.id
    await supabase.from('posts').delete().eq('user_id', uid)
    await supabase.from('comments').delete().eq('user_id', uid)
    await supabase.from('likes').delete().eq('user_id', uid)
    await supabase.from('messages').delete().or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
    await supabase.from('follows').delete().or(`follower_id.eq.${uid},following_id.eq.${uid}`)
    await supabase.from('stories').delete().eq('user_id', uid)
    await supabase.from('notifications').delete().or(`user_id.eq.${uid},actor_id.eq.${uid}`)
    await supabase.from('group_members').delete().eq('user_id', uid)
    await supabase.from('group_messages').delete().eq('user_id', uid)
    await supabase.from('profiles').delete().eq('id', uid)
    await supabase.auth.signOut()
    window.location.href = '/auth/signup'
  }

  const items: NavItem[] = [
    { key: 'feed', href: '/feed', label: 'Home', icon: ICONS.home },
    { key: 'search', href: '/search', label: 'Search', icon: ICONS.search },
    { key: 'people', href: '/people', label: 'People', icon: ICONS.people },
    { key: 'groups', href: '/groups', label: 'Groups', icon: ICONS.groups, badge: unreadGroups },
    { key: 'messages', href: '/messages', label: 'Chats', icon: ICONS.chat, badge: unreadDMs },
    { key: 'notifications', href: '/notifications', label: 'Alerts', icon: ICONS.bell, badge: unreadNotifs },
    { key: 'profile', href: '/profile', label: 'Profile', icon: ICONS.user },
  ]
  const desktopItems = items.filter(i => i.key !== 'profile')
  const mobileTabs = items.filter(i => ['feed', 'people', 'groups', 'messages', 'profile'].includes(i.key))

  return (
    <>
      {/* Top bar */}
      <nav className="glass-nav sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/feed" className="flex items-center gap-2.5 flex-shrink-0">
            <svg width="34" height="34" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#EC4899" />
                </linearGradient>
              </defs>
              <rect width="100" height="100" rx="26" fill="url(#navGrad)" />
              <polygon points="22,20 78,20 78,38 44,62 78,62 78,80 22,80 22,62 56,38 22,38" fill="white" />
            </svg>
            <span className="font-extrabold text-xl tracking-tight grad-text">Zoviq</span>
          </a>

          {/* Desktop pill navigation */}
          <div className="hidden md:flex items-center gap-1 p-1 rounded-2xl" style={{ background: 'var(--pill-bg)' }}>
            {desktopItems.map(item => (
              <a key={item.key} href={item.href} title={item.label}
                className={`nav-pill ${activePage === item.key ? 'active' : ''}`}>
                <Icon d={item.icon} />
                <Badge count={item.badge || 0} />
              </a>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {/* Mobile quick actions */}
            <div className="flex md:hidden items-center gap-1">
              <a href="/search" className="icon-btn" title="Search"><Icon d={ICONS.search} /></a>
              <a href="/notifications" className="icon-btn" title="Notifications">
                <Icon d={ICONS.bell} />
                <Badge count={unreadNotifs} />
              </a>
            </div>

            {/* Desktop profile */}
            <div className="hidden md:block">
              <a href="/profile" className="icon-btn" title="Profile"
                style={activePage === 'profile' ? { color: '#6366F1', background: 'var(--hover-bg)' } : {}}>
                <Icon d={ICONS.user} />
              </a>
            </div>

            {/* Settings */}
            <div className="relative" ref={settingsRef}>
              <button onClick={() => setShowSettings(!showSettings)} className="icon-btn" title="Settings"
                style={showSettings ? { color: '#6366F1', background: 'var(--hover-bg)' } : {}}>
                <Icon d={ICONS.cog} />
              </button>

              {showSettings && (
                <div className="dropdown absolute right-0 top-12 w-60 rounded-2xl overflow-hidden"
                  style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-hover)' }}>
                  <button className="menu-item" onClick={() => setDarkMode(!darkMode)}>
                    <Icon d={darkMode ? ICONS.sun : ICONS.moon} className="w-5 h-5" />
                    {darkMode ? 'Light mode' : 'Dark mode'}
                  </button>
                  <PushNotifications />
                  <a href="/settings/change-password" className="menu-item" onClick={() => setShowSettings(false)}>
                    <Icon d={ICONS.lock} className="w-5 h-5" />
                    Change password
                  </a>
                  <div className="h-px mx-3" style={{ background: 'var(--border)' }} />
                  <button className="menu-item" onClick={signOut}>
                    <Icon d={ICONS.logout} className="w-5 h-5" />
                    Sign out
                  </button>
                  <button className="menu-item danger" onClick={() => { setShowSettings(false); setShowDeleteConfirm(true) }}>
                    <Icon d={ICONS.trash} className="w-5 h-5" />
                    Delete account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-nav-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around h-16 px-2">
          {mobileTabs.map(item => (
            <a key={item.key} href={item.href} className={`tab-item ${activePage === item.key ? 'active' : ''}`}>
              <span className="relative">
                <Icon d={item.icon} className="w-6 h-6" />
                <Badge count={item.badge || 0} />
              </span>
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* Delete account modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,10,25,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="dropdown w-full max-w-sm rounded-3xl p-6" style={{ background: 'var(--surface-solid)', boxShadow: 'var(--shadow-hover)' }}>
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Delete your account?</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--sub)' }}>
                This permanently deletes your posts, messages and all your data. This cannot be undone.
              </p>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--sub)' }}>Type <strong>DELETE</strong> to confirm:</p>
            <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="DELETE"
              className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none mb-4"
              style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ color: 'var(--sub)', borderColor: 'var(--border)' }}>Cancel</button>
              <button onClick={deleteAccount} disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-red-600">
                {deleting ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
