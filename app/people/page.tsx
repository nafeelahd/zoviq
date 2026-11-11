'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { insertNotification } from '@/lib/notifications'
import Link from 'next/link'

type Person = { id: string; username: string; bio: string | null; avatar_url: string | null; is_private: boolean; isFollowing: boolean; requestPending: boolean; followerCount: number }

export default function PeoplePage() {
  const [userId, setUserId] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

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
    const [{ data: profiles, error: profilesError }, { data: follows, error: followsError }, { data: requests, error: requestsError }] = await Promise.all([
      supabase.from('profiles').select('*').neq('id', uid),
      supabase.from('follows').select('following_id').eq('follower_id', uid),
      supabase.from('follow_requests').select('following_id').eq('follower_id', uid),
    ])
    if (profilesError || followsError || requestsError) {
      const fetchError = profilesError || followsError || requestsError
      console.error('Could not load people or follow requests:', fetchError)
      setError('Could not load people. Apply the latest Supabase setup SQL and try again.')
      setLoading(false)
      return
    }
    setError('')
    const { data: followerCounts, error: countError } = await supabase.from('follows').select('following_id')
    if (countError) {
      console.error('Could not load follower counts:', countError)
      setError('Could not load follower counts. Please refresh and try again.')
    }
    const followingIds = new Set(follows?.map(f => f.following_id) || [])
    const requestIds = new Set(requests?.map(request => request.following_id) || [])
    const countMap: Record<string, number> = {}
    followerCounts?.forEach(f => { countMap[f.following_id] = (countMap[f.following_id] || 0) + 1 })
    setPeople((profiles || []).map(p => ({ ...p, isFollowing: followingIds.has(p.id), requestPending: requestIds.has(p.id), followerCount: countMap[p.id] || 0 })))
    setLoading(false)
  }

  const toggleFollow = async (person: Person) => {
    const supabase = createClient()
    if (person.isFollowing) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', person.id)
      if (error) {
        console.error('Could not unfollow person:', error)
        setError('Could not update your follow. Please try again.')
      }
    } else if (person.requestPending) {
      const { error } = await supabase.from('follow_requests').delete().eq('follower_id', userId).eq('following_id', person.id)
      if (error) {
        console.error('Could not cancel follow request:', error)
        setError('Could not cancel your request. Please try again.')
      }
    } else if (person.is_private) {
      const { error } = await supabase.from('follow_requests').insert({ follower_id: userId, following_id: person.id })
      if (error) {
        console.error('Could not send follow request:', error)
        setError('Could not send a follow request. Please try again.')
      }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: userId, following_id: person.id })
      if (error) {
        console.error('Could not follow person:', error)
        setError('Could not follow this person. Please try again.')
      }
      else await insertNotification(supabase, { user_id: person.id, actor_id: userId, type: 'follow' })
    }
    await fetchPeople(userId)
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
        {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

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
                        <Link href={`/profile/${encodeURIComponent(person.id)}`} className="text-sm font-semibold truncate hover:underline" style={{ color: 'var(--text)' }}>{person.username}</Link>
                        {person.is_private && <span className="ml-1 text-[10px]">🔒</span>}
                        {person.bio && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{person.bio}</p>}
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{person.followerCount} followers</p>
                      </div>
                      <button onClick={() => toggleFollow(person)}
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
                        <Link href={`/profile/${encodeURIComponent(person.id)}`} className="text-sm font-semibold truncate hover:underline" style={{ color: 'var(--text)' }}>{person.username}</Link>
                        {person.is_private && <span className="ml-1 text-[10px]">🔒</span>}
                        {person.bio && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{person.bio}</p>}
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{person.followerCount} followers</p>
                      </div>
                      <button onClick={() => toggleFollow(person)}
                        className="text-xs font-semibold px-4 py-2 rounded-xl text-white transition hover:opacity-90 shadow-sm"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                        {person.requestPending ? 'Requested' : person.is_private ? 'Request' : 'Follow'}
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