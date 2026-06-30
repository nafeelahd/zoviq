'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

type Person = { id: string; username: string; bio: string | null; avatar_url: string | null; isFollowing: boolean; followerCount: number }

export default function PeoplePage() {
  const [userId, setUserId] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      setUserId(data.session.user.id)
      fetchPeople(data.session.user.id)
    })
  }, [])

  const fetchPeople = async (uid: string) => {
    const supabase = createClient()
    const { data: profiles } = await supabase.from('profiles').select('*').neq('id', uid)
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', uid)
    const { data: followerCounts } = await supabase.from('follows').select('following_id')
    const followingIds = new Set(follows?.map(f => f.following_id) || [])
    const countMap: Record<string, number> = {}
    followerCounts?.forEach(f => { countMap[f.following_id] = (countMap[f.following_id] || 0) + 1 })
    setPeople((profiles || []).map(p => ({ ...p, isFollowing: followingIds.has(p.id), followerCount: countMap[p.id] || 0 })))
    setLoading(false)
  }

  const toggleFollow = async (targetId: string, isFollowing: boolean) => {
    const supabase = createClient()
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetId)
    } else {
      await supabase.from('follows').insert({ follower_id: userId, following_id: targetId })
      await supabase.from('notifications').insert({ user_id: targetId, actor_id: userId, type: 'follow' })
    }
    fetchPeople(userId)
  }

  const filtered = people.filter(p => p.username.toLowerCase().includes(search.toLowerCase()))
  const following = filtered.filter(p => p.isFollowing)
  const discover = filtered.filter(p => !p.isFollowing)

  const Avatar = ({ person }: { person: Person }) => (
    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white font-bold text-lg"
      style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
      {person.avatar_url ? <img src={person.avatar_url} alt={person.username} className="w-full h-full object-cover" /> : person.username[0].toUpperCase()}
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="people" />
      <main className="max-w-xl mx-auto py-6 px-4">
        <h1 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>People</h1>

        {/* Search */}
        <div className="relative mb-5">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search people..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 shadow-sm"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }} />
        </div>

        {loading ? (
          <div className="text-center py-16"><div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-5">
            {following.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--muted)' }}>Following</p>
                <div className="space-y-2">
                  {following.map(person => (
                    <div key={person.id} className="flex items-center gap-3 p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <Avatar person={person} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{person.username}</p>
                        {person.bio && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{person.bio}</p>}
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{person.followerCount} followers</p>
                      </div>
                      <button onClick={() => toggleFollow(person.id, true)}
                        className="text-xs font-medium px-4 py-2 rounded-xl border transition hover:bg-red-50 hover:text-red-500 hover:border-red-200"
                        style={{ color: 'var(--sub)', borderColor: '#E5E7EB' }}>
                        Following
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {discover.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--muted)' }}>Discover</p>
                <div className="space-y-2">
                  {discover.map(person => (
                    <div key={person.id} className="flex items-center gap-3 p-4 rounded-2xl border shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <Avatar person={person} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{person.username}</p>
                        {person.bio && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{person.bio}</p>}
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{person.followerCount} followers</p>
                      </div>
                      <button onClick={() => toggleFollow(person.id, false)}
                        className="text-xs font-semibold px-4 py-2 rounded-xl text-white transition hover:opacity-90 shadow-sm"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                        Follow
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-16 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <p className="text-3xl mb-2">👥</p>
                <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>{search ? 'No users found' : 'No other users yet'}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Invite your friends to join Zoviq!</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}