'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/lib/useTheme'

interface NavbarProps {
  activePage?: string
}

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
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
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
    })
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
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
    setUnreadNotifs(notifCount || 0); setUnreadDMs(dmCount || 0); setUnreadGroups(groupMsgCount)
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
    if (!session) return

    // Delete user data — RLS allows users to delete their own data
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

    // Sign out (actual auth.users deletion requires admin/server-side, so we sign out after clearing data)
    await supabase.auth.signOut()
    window.location.href = '/auth/signup'
  }

  const nav = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
  const text = darkMode ? 'text-gray-300' : 'text-gray-500'
  const active = 'text-indigo-500'

  const ZoviqLogo = () => (
    <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
      <rect width="100" height="100" rx="24" fill="url(#navGrad)"/>
      <defs><linearGradient id="navGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6366F1"/><stop offset="100%" stopColor="#EC4899"/>
      </linearGradient></defs>
      <polygon points="22,20 78,20 78,38 44,62 78,62 78,80 22,80 22,62 56,38 22,38" fill="white"/>
    </svg>
  )

  const Badge = ({ count }: { count: number }) =>
    count > 0 ? (
      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full min-w-4 h-4 flex items-center justify-center font-medium px-0.5">
        {count > 9 ? '9+' : count}
      </span>
    ) : null

  return (
    <>
      <nav className={`${nav} border-b px-6 py-3.5 flex items-center justify-between sticky top-0 z-10`}>
        <a href="/feed" className="flex items-center gap-2.5">
          <ZoviqLogo />
          <span className="font-bold text-lg" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zoviq</span>
        </a>

        <div className="flex items-center gap-5">
          <a href="/feed" className={`text-sm transition hover:text-indigo-500 inline-flex items-center ${activePage === 'feed' ? active : text}`} title="Home">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          </a>
          <a href="/search" className={`text-sm transition hover:text-indigo-500 inline-flex items-center ${activePage === 'search' ? active : text}`} title="Search">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </a>
          <a href="/people" className={`text-sm transition hover:text-indigo-500 inline-flex items-center ${activePage === 'people' ? active : text}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </a>
          <a href="/groups" className={`relative text-sm transition hover:text-indigo-500 inline-flex items-center ${activePage === 'groups' ? active : text}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <Badge count={unreadGroups} />
          </a>
          <a href="/messages" className={`relative text-sm transition hover:text-indigo-500 inline-flex items-center ${activePage === 'messages' ? active : text}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            <Badge count={unreadDMs} />
          </a>
          <a href="/notifications" className={`relative text-sm transition hover:text-indigo-500 inline-flex items-center ${activePage === 'notifications' ? active : text}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <Badge count={unreadNotifs} />
          </a>
          <a href="/profile" className={`text-sm transition hover:text-indigo-500 inline-flex items-center ${activePage === 'profile' ? active : text}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          </a>

          {/* Settings dropdown */}
          <div className="relative flex items-center" ref={settingsRef}>
            <button onClick={() => setShowSettings(!showSettings)} className={`text-sm transition hover:text-indigo-500 flex items-center ${showSettings ? active : text}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>

            {showSettings && (
              <div className="absolute right-0 top-10 w-56 rounded-2xl shadow-xl border overflow-hidden z-20"
                style={{ background: darkMode ? '#1A1A2E' : 'white', borderColor: darkMode ? '#2D2D44' : '#F0EFF8' }}>
                <button onClick={() => setDarkMode(!darkMode)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50 text-left"
                  style={{ color: darkMode ? '#F1F0FF' : '#1A1A2E' }}>
                  <span className="text-lg">{darkMode ? '☀️' : '🌙'}</span>
                  <span className="text-sm font-medium">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
                <a href="/settings/change-password" onClick={() => setShowSettings(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50 text-left"
                  style={{ color: darkMode ? '#F1F0FF' : '#1A1A2E' }}>
                  <span className="text-lg">🔒</span>
                  <span className="text-sm font-medium">Change Password</span>
                </a>
                <div className="h-px" style={{ background: darkMode ? '#2D2D44' : '#F0EFF8' }} />
                <button onClick={signOut}
                  className="w-full flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50 text-left"
                  style={{ color: darkMode ? '#F1F0FF' : '#1A1A2E' }}>
                  <span className="text-lg">🚪</span>
                  <span className="text-sm font-medium">Sign Out</span>
                </button>
                <button onClick={() => { setShowSettings(false); setShowDeleteConfirm(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3 transition hover:bg-red-50 text-left text-red-500">
                  <span className="text-lg">🗑️</span>
                  <span className="text-sm font-medium">Delete Account</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Delete account confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Delete your account?</h2>
              <p className="text-sm text-gray-500 mt-1">This will permanently delete your posts, messages, and all your data. This cannot be undone.</p>
            </div>
            <p className="text-xs text-gray-500 mb-2">Type <strong>DELETE</strong> to confirm:</p>
            <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
              <button onClick={deleteAccount} disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-red-600 transition">
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}