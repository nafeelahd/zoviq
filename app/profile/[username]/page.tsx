'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PostMedia from '@/components/PostMedia'
import ShareModal from '@/components/ShareModal'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  id: string
  username: string
  bio: string | null
  avatar_url: string | null
  is_private: boolean
}

type Post = {
  id: string
  content: string
  image_url: string | null
  video_url: string | null
  created_at: string
  likes: { user_id: string }[]
  comments: { id: string }[]
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>()
  const profileKey = params.username
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [viewerId, setViewerId] = useState('')
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [requestPending, setRequestPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.replace('/auth/login')
        return
      }
      if (!active) return
      setViewerId(session.user.id)

      const byId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileKey)
      const findProfile = () => byId
        ? supabase.from('profiles').select('id, username, bio, avatar_url, is_private').eq('id', profileKey).maybeSingle()
        : supabase.from('profiles').select('id, username, bio, avatar_url, is_private').eq('username', profileKey.toLowerCase()).maybeSingle()

      let { data: foundProfile, error: profileError } = await findProfile()
      if (profileError?.message.includes('is_private')) {
        console.error('Private profile schema is not installed:', profileError)
        const fallback = byId
          ? await supabase.from('profiles').select('id, username, bio, avatar_url').eq('id', profileKey).maybeSingle()
          : await supabase.from('profiles').select('id, username, bio, avatar_url').eq('username', profileKey.toLowerCase()).maybeSingle()
        foundProfile = fallback.data ? {
          id: fallback.data.id,
          username: fallback.data.username,
          bio: fallback.data.bio,
          avatar_url: fallback.data.avatar_url,
          is_private: false,
        } : null
        profileError = fallback.error
        if (!fallback.error && fallback.data) {
          setError('Account privacy is not enabled yet. Ask the site owner to apply the latest Supabase setup SQL.')
        }
      }
      if (!active) return
      if (profileError || !foundProfile) {
        if (profileError) console.error('Could not load profile:', profileError)
        setError(profileError ? 'Could not load this profile.' : 'This profile could not be found.')
        setLoading(false)
        return
      }
      setProfile(foundProfile)

      const isOwner = session.user.id === foundProfile.id
      const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', foundProfile.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', foundProfile.id),
      ])
      if (!active) return
      setFollowers(followerCount || 0)
      setFollowing(followingCount || 0)

      let followsProfile = false
      if (!isOwner) {
        const { data: relation } = await supabase.from('follows').select('follower_id')
          .eq('follower_id', session.user.id).eq('following_id', foundProfile.id).maybeSingle()
        const { data: request } = foundProfile.is_private
          ? await supabase.from('follow_requests').select('follower_id')
            .eq('follower_id', session.user.id).eq('following_id', foundProfile.id).maybeSingle()
          : { data: null }
        if (!active) return
        followsProfile = Boolean(relation)
        setIsFollowing(followsProfile)
        setRequestPending(Boolean(request))
      }

      if (isOwner || !foundProfile.is_private || followsProfile) {
        const { data: postData, error: postsError } = await supabase.from('posts')
          .select('*, likes(user_id), comments(id)')
          .eq('user_id', foundProfile.id)
          .order('created_at', { ascending: false })
        if (!active) return
        if (postsError) {
          console.error('Could not load profile posts:', postsError)
          setError('Could not load posts for this profile.')
        } else {
          setPosts(postData || [])
        }
      }
      setLoading(false)
    }

    void loadProfile()
    return () => { active = false }
  }, [profileKey])

  const toggleFollow = async () => {
    if (!profile || busy) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    if (isFollowing) {
      const { error: unfollowError } = await supabase.from('follows').delete()
        .eq('follower_id', viewerId).eq('following_id', profile.id)
      if (unfollowError) {
        console.error('Could not unfollow profile:', unfollowError)
        setError('Could not update your follow. Please try again.')
      } else {
        setIsFollowing(false)
        setFollowers(count => Math.max(0, count - 1))
      }
    } else if (requestPending) {
      const { error: cancelError } = await supabase.from('follow_requests').delete()
        .eq('follower_id', viewerId).eq('following_id', profile.id)
      if (cancelError) {
        console.error('Could not cancel follow request:', cancelError)
        setError('Could not cancel your request. Please try again.')
      } else {
        setRequestPending(false)
      }
    } else if (profile.is_private) {
      const { error: requestError } = await supabase.from('follow_requests')
        .insert({ follower_id: viewerId, following_id: profile.id })
      if (requestError) {
        console.error('Could not send follow request:', requestError)
        setError('Could not send a follow request. Please try again.')
      } else {
        setRequestPending(true)
      }
    } else {
      const { error: followError } = await supabase.from('follows')
        .insert({ follower_id: viewerId, following_id: profile.id })
      if (followError) {
        console.error('Could not follow profile:', followError)
        setError('Could not follow this profile. Please try again.')
      } else {
        setIsFollowing(true)
        setFollowers(count => count + 1)
      }
    }
    setBusy(false)
  }

  const isOwner = Boolean(profile && profile.id === viewerId)
  const canSeePosts = Boolean(profile && (!profile.is_private || isFollowing || isOwner))

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}><div className="w-9 h-9 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="profile" />
      {shareOpen && profile && <ShareModal url={`/profile/${profile.username}`} title={`Check out @${profile.username} on Zoviq`} type="profile" onClose={() => setShareOpen(false)} />}
      <main className="max-w-3xl mx-auto py-6 md:py-10 px-4 space-y-6">
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        {!profile ? (
          <div className="rounded-3xl border p-10 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-5xl mb-3">👤</p>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Profile not found</h1>
            <a href="/people" className="inline-block mt-4 text-sm font-semibold text-indigo-500">Discover people →</a>
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-[2rem] border shadow-xl transition-all duration-300 hover:shadow-2xl" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="h-28 md:h-40 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 20% 20%, #A78BFA 0, transparent 38%), radial-gradient(circle at 80% 10%, #F472B6 0, transparent 35%), linear-gradient(120deg, #4F46E5, #A855F7 55%, #EC4899)' }}>
                <div className="absolute -bottom-16 -right-10 w-56 h-56 rounded-full border border-white/20" />
                <div className="absolute -top-20 left-1/3 w-48 h-48 rounded-full border border-white/20" />
              </div>
              <div className="px-5 pb-6 md:px-8 md:pb-8">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 md:-mt-16 mb-6 relative">
                  <div className="w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden border-4 shadow-lg flex items-center justify-center text-3xl text-white font-bold" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', borderColor: 'var(--card)' }}>
                    {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" /> : profile.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{profile.username}</h1>
                      {profile.is_private && <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-violet-200 bg-violet-50 text-violet-700">🔒 Private</span>}
                    </div>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--sub)' }}>{profile.bio || 'No bio yet.'}</p>
                  </div>
                  {!isOwner && <button onClick={toggleFollow} disabled={busy}
                    className="sm:ml-auto shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                    style={isFollowing
                      ? { color: 'var(--text)', border: '1px solid var(--border)', background: 'var(--card)' }
                      : { color: 'white', background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                    {busy ? 'Please wait…' : isFollowing ? 'Following' : requestPending ? 'Requested' : profile.is_private ? 'Request to follow' : 'Follow'}
                  </button>}
                  {isOwner && <a href="/profile" className="sm:ml-auto shrink-0 px-5 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>Edit profile</a>}
                  <button onClick={() => setShareOpen(true)} className="w-10 h-10 rounded-xl border transition hover:-translate-y-0.5" style={{ color: 'var(--text)', borderColor: 'var(--border)' }} aria-label="Share profile">↗</button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[{ value: posts.length, label: 'Posts' }, { value: followers, label: 'Followers' }, { value: following, label: 'Following' }].map(item => (
                    <div key={item.label} className="text-center py-4 rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                      <p className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>{item.value}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {canSeePosts ? (
              <section>
                <div className="flex items-center justify-between mb-4 px-1">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Posts</h2>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{posts.length} shared</span>
                </div>
                {posts.length ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {posts.map(post => (
                      <article key={post.id} className="rounded-3xl border p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                        {post.image_url && <PostMedia src={post.image_url} alt="post" className="w-full aspect-square object-cover rounded-2xl mb-3" />}
                        {post.video_url && <PostMedia src={post.video_url} alt="post video" video className="w-full aspect-square rounded-2xl mb-3 bg-black" />}
                        {post.content && <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{post.content}</p>}
                        <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                          <span>♥ {post.likes?.length || 0}</span><span>◌ {post.comments?.length || 0}</span>
                          <time className="ml-auto">{new Date(post.created_at).toLocaleDateString()}</time>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <div className="rounded-3xl border p-10 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-4xl mb-2">✨</p><p className="text-sm" style={{ color: 'var(--muted)' }}>No posts yet.</p>
                </div>}
              </section>
            ) : (
              <section className="rounded-3xl border p-10 text-center shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-2xl" style={{ background: '#F5F3FF' }}>🔒</div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>This account is private</h2>
                <p className="max-w-sm mx-auto mt-2 text-sm" style={{ color: 'var(--muted)' }}>Follow {profile.username} to see their photos, videos, and stories.</p>
                {!requestPending && <button onClick={toggleFollow} disabled={busy} className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>{busy ? 'Please wait…' : 'Request to follow'}</button>}
                {requestPending && <p className="mt-5 text-sm font-semibold text-violet-600">Follow request sent</p>}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
