'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

type Post = { id: string; content: string; image_url: string | null; created_at: string; user_id: string }
type Profile = { id: string; username: string; bio: string | null; avatar_url: string | null }

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'posts' | 'people'>('posts')
  const [userId, setUserId] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      setUserId(data.session.user.id)
    })
  }, [])

  useEffect(() => {
    if (!query.trim()) { setPosts([]); setPeople([]); return }
    const timer = setTimeout(() => search(query), 400)
    return () => clearTimeout(timer)
  }, [query])

  const search = async (q: string) => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: postsData }, { data: peopleData }] = await Promise.all([
      supabase.from('posts').select('*').ilike('content', `%${q}%`).order('created_at', { ascending: false }).limit(20),
      supabase.from('profiles').select('*').ilike('username', `%${q}%`).limit(20),
    ])
    setPosts(postsData || []); setPeople(peopleData || [])
    setLoading(false)
  }

  const timeAgo = (date: string) => {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  const highlight = (text: string) => text.split(new RegExp(`(${query})`, 'gi')).map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="px-0.5 rounded" style={{ background: '#EEF2FF', color: '#6366F1' }}>{part}</mark>
      : part
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="search" />
      <main className="max-w-xl mx-auto py-6 px-4">

        {/* Search bar */}
        <div className="relative mb-5">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">🔍</span>
          <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search posts or people..."
            className="w-full pl-11 pr-10 py-3.5 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 shadow-sm"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }} />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-lg" style={{ color: 'var(--muted)' }}>×</button>
          )}
        </div>

        {/* Tabs */}
        {query && (
          <div className="flex gap-2 mb-5">
            {(['posts', 'people'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition capitalize"
                style={tab === t
                  ? { background: 'linear-gradient(135deg, #6366F1, #EC4899)', color: 'white' }
                  : { background: 'white', color: 'var(--sub)', border: '1px solid #F0EFF8' }}>
                {t} {t === 'posts' ? `(${posts.length})` : `(${people.length})`}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="text-center py-12"><div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        )}

        {!query && !loading && (
          <div className="text-center py-16 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Search for anything</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Find posts by keyword or people by username</p>
          </div>
        )}

        {!loading && query && posts.length === 0 && people.length === 0 && (
          <div className="text-center py-16 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-4xl mb-3">😕</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No results for "{query}"</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Try a different keyword</p>
          </div>
        )}

        {/* Posts */}
        {!loading && tab === 'posts' && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map(post => (
              <div key={post.id} className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                {post.image_url && <img src={post.image_url} alt="post" className="w-full max-h-48 object-cover" />}
                <div className="p-4">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{highlight(post.content)}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>{timeAgo(post.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* People */}
        {!loading && tab === 'people' && people.length > 0 && (
          <div className="space-y-2">
            {people.map(person => (
              <div key={person.id} className="flex items-center gap-3 p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                  {person.avatar_url ? <img src={person.avatar_url} alt={person.username} className="w-full h-full object-cover" /> : person.username[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{highlight(person.username)}</p>
                  {person.bio && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{person.bio}</p>}
                </div>
                {person.id !== userId && (
                  <a href="/people" className="text-xs font-semibold hover:underline" style={{ color: '#6366F1' }}>View →</a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}