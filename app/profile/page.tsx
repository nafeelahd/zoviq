'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import ShareModal from '@/components/ShareModal'
import PostMedia from '@/components/PostMedia'

type Post = {
  id: string; content: string; image_url: string | null; video_url: string | null
  created_at: string; likes: { user_id: string }[]; comments: { id: string }[]
}
type Profile = { id: string; username: string; bio: string | null; avatar_url: string | null; is_private: boolean }
type FollowRequest = { follower_id: string; username: string; avatar_url: string | null; created_at: string }

export default function ProfilePage() {
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [savedPosts, setSavedPosts] = useState<Post[]>([])
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [bio, setBio] = useState('')
  const [username, setUsername] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [privacyError, setPrivacyError] = useState('')
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([])
  const [requestError, setRequestError] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const avatarRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      setEmail(data.session.user.email || '')
      setUserId(data.session.user.id)
      fetchProfile(data.session.user.id)
    })
  }, [])

  const fetchProfile = async (uid: string) => {
    const supabase = createClient()
    const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (profileError) {
      console.error('Could not load your profile:', profileError)
      setProfileMsg('Could not load your profile.')
      setLoading(false)
      return
    }
    if (profileData) { setProfile(profileData); setBio(profileData.bio || ''); setUsername(profileData.username || '') }
    const { data: requests, error: requestsError } = await supabase
      .from('follow_requests')
      .select('follower_id, created_at')
      .eq('following_id', uid)
      .order('created_at', { ascending: false })
    if (requestsError) {
      console.error('Could not load follow requests:', requestsError)
      setRequestError('Could not load follow requests. Apply the latest Supabase setup SQL to enable private accounts.')
    } else if (requests?.length) {
      const { data: requestProfiles, error: requestProfilesError } = await supabase.from('profiles').select('id, username, avatar_url')
        .in('id', requests.map(request => request.follower_id))
      if (requestProfilesError) {
        console.error('Could not load follow-request profiles:', requestProfilesError)
        setRequestError('Could not load the people who requested to follow you.')
      }
      const profilesById = new Map(requestProfiles?.map(person => [person.id, person]) || [])
      setFollowRequests(requests.map(request => ({
        ...request,
        username: profilesById.get(request.follower_id)?.username || 'Someone',
        avatar_url: profilesById.get(request.follower_id)?.avatar_url || null,
      })))
    } else {
      setFollowRequests([])
    }
    const { data: postsData, error: postsError } = await supabase.from('posts').select('*, likes(user_id), comments(id)').eq('user_id', uid).order('created_at', { ascending: false })
    if (postsError) {
      console.error('Could not load your posts:', postsError)
      setProfileMsg('Could not load your posts. Please refresh and try again.')
    }
    setPosts(postsData || [])
    const { count: fc } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid)
    const { count: fc2 } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid)
    setFollowers(fc || 0); setFollowing(fc2 || 0)

    const savedIds = JSON.parse(window.localStorage.getItem('zoviq-saved-posts') || '[]') as string[]
    if (savedIds.length > 0) {
      const { data: savedData } = await supabase.from('posts').select('*, likes(user_id), comments(id)').in('id', savedIds).order('created_at', { ascending: false })
      setSavedPosts(savedData || [])
    } else {
      setSavedPosts([])
    }

    setLoading(false)
  }

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `avatars/${userId}/avatar.${ext}`
    await supabase.storage.from('posts').upload(path, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: urlData.publicUrl + '?t=' + Date.now() }).eq('id', userId)
    setUploadingAvatar(false)
    fetchProfile(userId)
    if (avatarRef.current) avatarRef.current.value = ''
  }

  const saveProfile = async () => {
    const normalizedUsername = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
      setProfileMsg('Username must be 3-30 characters using letters, numbers, and underscores.')
      return
    }
    setSavingProfile(true)
    setProfileMsg('')
    const supabase = createClient()

    const { data: existing } = await supabase.from('profiles').select('id').eq('username', normalizedUsername).neq('id', userId).single()
    if (existing) { setProfileMsg('Username already taken'); setSavingProfile(false); return }

    const { error } = await supabase.from('profiles').update({ username: normalizedUsername, bio: bio.trim() }).eq('id', userId)
    if (error) { setProfileMsg(error.message) } else { setEditingProfile(false); fetchProfile(userId) }
    setSavingProfile(false)
  }

  const togglePrivacy = async () => {
    if (!profile) return
    setPrivacySaving(true)
    setPrivacyError('')
    const makePublic = profile.is_private
    const { error } = await createClient().from('profiles')
      .update({ is_private: !makePublic })
      .eq('id', userId)
    if (error) {
      console.error('Could not update account privacy:', error)
      setPrivacyError(`Could not update privacy: ${error.message}`)
    } else {
      setProfile({ ...profile, is_private: !makePublic })
      if (makePublic) {
        const { error: clearRequestsError } = await createClient().from('follow_requests')
          .delete().eq('following_id', userId)
        if (clearRequestsError) {
          console.error('Could not clear pending follow requests:', clearRequestsError)
          setPrivacyError('Your account is public, but some old follow requests could not be cleared.')
        } else {
          setFollowRequests([])
        }
      }
    }
    setPrivacySaving(false)
  }

  const respondToFollowRequest = async (followerId: string, accept: boolean) => {
    setRequestError('')
    const supabase = createClient()
    const result = accept
      ? await supabase.rpc('accept_follow_request', { requester_id: followerId })
      : await supabase.from('follow_requests').delete().eq('follower_id', followerId).eq('following_id', userId)
    if (result.error) {
      console.error('Could not respond to follow request:', result.error)
      setRequestError('Could not update the request. Please try again.')
      return
    }
    setFollowRequests(current => current.filter(request => request.follower_id !== followerId))
    if (accept) setFollowers(count => count + 1)
  }

  const deletePost = async (id: string) => {
    const supabase = createClient()
    await supabase.from('posts').delete().eq('id', id)
    fetchProfile(userId)
  }

  const timeAgo = (date: string) => {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="profile" />
      {shareOpen && <ShareModal url={`/profile/${profile?.username || ''}`} title="Check out my Zoviq profile!" type="profile" onClose={() => setShareOpen(false)} />}

      <main className="max-w-3xl mx-auto py-6 md:py-10 px-4 space-y-6">
        {profileMsg && !editingProfile && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{profileMsg}</div>}

        {/* Profile card */}
        <div className="overflow-hidden rounded-[2rem] border shadow-xl transition-all duration-300 hover:shadow-2xl" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="h-28 md:h-40 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 20% 20%, #A78BFA 0, transparent 38%), radial-gradient(circle at 80% 10%, #F472B6 0, transparent 35%), linear-gradient(120deg, #4F46E5, #A855F7 55%, #EC4899)' }}>
            <div className="absolute -bottom-16 -right-10 w-56 h-56 rounded-full border border-white/20" />
            <div className="absolute -top-20 left-1/3 w-48 h-48 rounded-full border border-white/20" />
          </div>
          <div className="px-5 pb-6 md:px-8 md:pb-8">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 md:-mt-16 mb-6 relative">
            {/* Avatar */}
            <div className="relative flex-shrink-0 self-start">
              <div onClick={() => avatarRef.current?.click()}
                className="w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden cursor-pointer relative group border-4 shadow-lg transition-transform duration-300 hover:scale-[1.03]"
                style={{ borderColor: 'var(--card)' }}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold"
                    style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                    {email[0]?.toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition flex items-center justify-center rounded-full">
                  {uploadingAvatar
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <span className="text-white text-xl opacity-0 group-hover:opacity-100 transition">📷</span>
                  }
                </div>
              </div>
              <input ref={avatarRef} type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pb-1">
              {editingProfile ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Username</label>
                    <input type="text" maxLength={30} value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
                      placeholder="username"
                      className="w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Bio</label>
                    <textarea value={bio} onChange={e => setBio(e.target.value)}
                      placeholder="Write something about yourself..." rows={2} maxLength={160}
                      className="w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                      style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} />
                  </div>
                  {profileMsg && <p className="text-xs text-red-500">{profileMsg}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveProfile} disabled={savingProfile}
                      className="text-white text-xs px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                      {savingProfile ? 'Saving...' : 'Save changes'}
                    </button>
                    <button onClick={() => { setEditingProfile(false); setProfileMsg(''); setUsername(profile?.username || ''); setBio(profile?.bio || '') }}
                      className="text-xs px-4 py-2 rounded-lg border" style={{ color: 'var(--sub)', borderColor: '#E5E7EB' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{profile?.username || email.split('@')[0]}</h1>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border" style={{ color: profile?.is_private ? '#7C3AED' : '#059669', borderColor: profile?.is_private ? '#DDD6FE' : '#A7F3D0', background: profile?.is_private ? '#F5F3FF' : '#ECFDF5' }}>
                      {profile?.is_private ? '🔒 Private' : '✦ Public'}
                    </span>
                    <button onClick={() => setShareOpen(true)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition text-base" title="Share profile">📤</button>
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{email}</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--sub)' }}>{profile?.bio || 'Add a little about yourself to make your profile yours.'}</p>
                </div>
              )}
            </div>
            {!editingProfile && <button onClick={() => setEditingProfile(true)}
              className="sm:ml-auto shrink-0 text-sm font-semibold px-4 py-2.5 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--card)' }}>✏️ Edit profile</button>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[{ num: posts.length, label: 'Posts' }, { num: followers, label: 'Followers' }, { num: following, label: 'Following' }].map((s, i) => (
              <div key={i} className="text-center py-4 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                <p className="text-lg font-bold" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.num}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>
          </div>
        </div>

        <section className="rounded-3xl border p-5 md:p-6 shadow-sm transition-shadow hover:shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0" style={{ background: profile?.is_private ? '#F5F3FF' : '#ECFDF5' }}>{profile?.is_private ? '🔒' : '🌍'}</div>
            <div className="flex-1">
              <h2 className="font-bold" style={{ color: 'var(--text)' }}>Account privacy</h2>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {profile?.is_private
                  ? 'Only followers you approve can see your posts and stories.'
                  : 'Your posts and stories are visible to everyone on Zoviq.'}
              </p>
              <button onClick={togglePrivacy} disabled={privacySaving}
                className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                {privacySaving ? 'Updating…' : `Switch to ${profile?.is_private ? 'public' : 'private'}`}
              </button>
              {privacyError && <p role="alert" className="text-xs text-red-500 mt-2">{privacyError}</p>}
              <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>Your profile photo and username stay visible so people can find you.</p>
            </div>
          </div>
        </section>

        {profile?.is_private && (
          <section className="rounded-3xl border p-5 md:p-6 shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-bold" style={{ color: 'var(--text)' }}>Follow requests</h2>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Choose who can see your private posts.</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: '#F5F3FF', color: '#7C3AED' }}>{followRequests.length}</span>
            </div>
            {requestError && <p className="mb-3 text-sm text-red-500">{requestError}</p>}
            {followRequests.length === 0 ? (
              <p className="text-sm py-4 text-center rounded-2xl" style={{ color: 'var(--muted)', background: 'var(--bg)' }}>You’re all caught up.</p>
            ) : <div className="space-y-2">
              {followRequests.map(request => (
                <div key={request.follower_id} className="flex items-center gap-3 p-3 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
                  <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white font-bold" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                    {request.avatar_url ? <img src={request.avatar_url} alt="" className="w-full h-full object-cover" /> : request.username[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 font-semibold text-sm" style={{ color: 'var(--text)' }}>{request.username}</span>
                  <button onClick={() => respondToFollowRequest(request.follower_id, true)} className="px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>Accept</button>
                  <button onClick={() => respondToFollowRequest(request.follower_id, false)} className="px-3 py-2 rounded-xl text-xs font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--sub)' }}>Remove</button>
                </div>
              ))}
            </div>}
          </section>
        )}

        {savedPosts.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--muted)' }}>Saved Posts</p>
            <div className="space-y-3">
              {savedPosts.map(post => (
                <div key={post.id} className="rounded-2xl border p-4 shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  {post.image_url && <PostMedia src={post.image_url} alt="saved post" className="w-full max-h-48 object-cover rounded-xl mb-3" />}
                  {post.content && <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text)' }}>{post.content}</p>}
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
                    <div className="flex items-center gap-3">
                      <span>❤️ {post.likes?.length || 0}</span>
                      <span>💬 {post.comments?.length || 0}</span>
                      <span>{timeAgo(post.created_at)}</span>
                    </div>
                    <span className="px-2 py-1 rounded-lg" style={{ background: '#EEF2FF', color: '#6366F1' }}>Saved</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Posts */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--muted)' }}>Your Posts</p>
          {posts.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <p className="text-3xl mb-2">✨</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No posts yet. Share something!</p>
              <a href="/feed" className="text-xs font-medium mt-2 inline-block hover:underline" style={{ color: '#6366F1' }}>Go to feed →</a>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="rounded-2xl border p-4 shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  {post.image_url && <PostMedia src={post.image_url} alt="post" className="w-full max-h-48 object-cover rounded-xl mb-3" />}
                  {post.video_url && <PostMedia src={post.video_url} alt="post video" video className="w-full max-h-48 rounded-xl mb-3 bg-black" />}
                  {post.content && <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text)' }}>{post.content}</p>}
                  <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
                    <div className="flex items-center gap-3">
                      <span>❤️ {post.likes?.length || 0}</span>
                      <span>💬 {post.comments?.length || 0}</span>
                      <span>{timeAgo(post.created_at)}</span>
                    </div>
                    <button onClick={() => deletePost(post.id)} className="hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-red-50">delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}