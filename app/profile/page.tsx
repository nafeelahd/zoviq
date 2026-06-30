'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import ShareModal from '@/components/ShareModal'

type Post = {
  id: string; content: string; image_url: string | null
  created_at: string; likes: { user_id: string }[]; comments: { id: string }[]
}
type Profile = { id: string; username: string; bio: string | null; avatar_url: string | null }

export default function ProfilePage() {
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [bio, setBio] = useState('')
  const [username, setUsername] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
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
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (profileData) { setProfile(profileData); setBio(profileData.bio || ''); setUsername(profileData.username || '') }
    const { data: postsData } = await supabase.from('posts').select('*, likes(user_id), comments(id)').eq('user_id', uid).order('created_at', { ascending: false })
    setPosts(postsData || [])
    const { count: fc } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid)
    const { count: fc2 } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid)
    setFollowers(fc || 0); setFollowing(fc2 || 0)
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
    if (!username.trim()) { setProfileMsg('Username cannot be empty'); return }
    setSavingProfile(true)
    setProfileMsg('')
    const supabase = createClient()

    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.trim()).neq('id', userId).single()
    if (existing) { setProfileMsg('Username already taken'); setSavingProfile(false); return }

    const { error } = await supabase.from('profiles').update({ username: username.trim(), bio: bio.trim() }).eq('id', userId)
    if (error) { setProfileMsg(error.message) } else { setEditingProfile(false); fetchProfile(userId) }
    setSavingProfile(false)
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
      {shareOpen && <ShareModal url="/profile" title="Check out my Zoviq profile!" type="profile" onClose={() => setShareOpen(false)} />}

      <main className="max-w-xl mx-auto py-6 px-4 space-y-4">

        {/* Profile card */}
        <div className="rounded-2xl border p-6 shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-start gap-4 mb-5">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div onClick={() => avatarRef.current?.click()}
                className="w-20 h-20 rounded-full overflow-hidden cursor-pointer relative group border-2"
                style={{ borderColor: '#EEF2FF' }}>
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
            <div className="flex-1">
              {editingProfile ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Username</label>
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                      placeholder="username" maxLength={30}
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
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{profile?.username || email.split('@')[0]}</h1>
                    <button onClick={() => setShareOpen(true)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 transition text-base" title="Share profile">📤</button>
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{email}</p>
                  <p className="text-sm" style={{ color: 'var(--sub)' }}>{profile?.bio || 'No bio yet.'}</p>
                  <button onClick={() => setEditingProfile(true)}
                    className="flex items-center gap-1 text-xs font-medium mt-2 hover:underline" style={{ color: '#6366F1' }}>
                    ✏️ Edit Profile
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-0 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {[{ num: posts.length, label: 'Posts' }, { num: followers, label: 'Followers' }, { num: following, label: 'Following' }].map((s, i) => (
              <div key={i} className="flex-1 text-center py-3" style={{ borderRight: i < 2 ? '1px solid #F0EFF8' : 'none' }}>
                <p className="text-lg font-bold" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.num}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

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
                  {post.image_url && <img src={post.image_url} alt="post" className="w-full max-h-48 object-cover rounded-xl mb-3" />}
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