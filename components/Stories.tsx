'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Story = {
  id: string
  user_id: string
  image_url: string | null
  video_url: string | null
  created_at: string
  expires_at: string
}

type UserStories = {
  user_id: string
  username: string
  avatar_url: string | null
  stories: Story[]
  allViewed: boolean
}

export default function Stories({ userId, email }: { userId: string; email: string }) {
  const [groupedStories, setGroupedStories] = useState<UserStories[]>([])
  const [viewingUser, setViewingUser] = useState<UserStories | null>(null)
  const [storyIndex, setStoryIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const progressRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { fetchStories() }, [userId])

  useEffect(() => {
    if (viewingUser) {
      setProgress(0)
      const currentStory = viewingUser.stories[storyIndex]
      if (currentStory) markViewed(currentStory.id)

      progressRef.current = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            clearInterval(progressRef.current!)
            // Move to next story or close
            if (storyIndex < viewingUser.stories.length - 1) {
              setStoryIndex(i => i + 1)
            } else {
              setViewingUser(null)
              setStoryIndex(0)
            }
            return 0
          }
          return p + 2
        })
      }, 100)
    }
    return () => { if (progressRef.current) clearInterval(progressRef.current) }
  }, [viewingUser, storyIndex])

  const fetchStories = async () => {
    const supabase = createClient()
    const { data: storiesData } = await supabase
      .from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true })

    if (!storiesData || storiesData.length === 0) { setGroupedStories([]); return }

    const userIds = Array.from(new Set(storiesData.map(s => s.user_id))) as string[]
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
    const profileMap: Record<string, any> = {}
    profiles?.forEach(p => { profileMap[p.id] = p })

    const { data: viewsData } = await supabase.from('story_views').select('story_id').eq('viewer_id', userId)
    const viewedIds = new Set(viewsData?.map(v => v.story_id) || [])

    // Group stories by user
    const grouped: Record<string, Story[]> = {}
    storiesData.forEach(s => {
      if (!grouped[s.user_id]) grouped[s.user_id] = []
      grouped[s.user_id].push(s)
    })

    const result: UserStories[] = Object.entries(grouped).map(([uid, stories]) => ({
      user_id: uid,
      username: profileMap[uid]?.username || (uid === userId ? email.split('@')[0] : 'user'),
      avatar_url: profileMap[uid]?.avatar_url || null,
      stories,
      allViewed: stories.every(s => viewedIds.has(s.id)),
    }))

    // My stories first, then others sorted by most recent
    result.sort((a, b) => {
      if (a.user_id === userId) return -1
      if (b.user_id === userId) return 1
      return 0
    })

    setGroupedStories(result)
  }

  const markViewed = async (storyId: string) => {
    const supabase = createClient()
    await supabase.from('story_views').upsert({ story_id: storyId, viewer_id: userId })
    // Don't refetch during viewing to avoid disrupting progress
  }

  const uploadStory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `stories/${userId}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage.from('posts').upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadErr) { setUploadError('Upload failed: ' + uploadErr.message); setUploading(false); if (fileRef.current) fileRef.current.value = ''; return }

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
      const isVideo = file.type.startsWith('video/')

      const { error: insertErr } = await supabase.from('stories').insert({
        user_id: userId,
        image_url: isVideo ? null : urlData.publicUrl,
        video_url: isVideo ? urlData.publicUrl : null,
      })

      if (insertErr) setUploadError('Story failed: ' + insertErr.message)
      else fetchStories()
    } catch (err: any) {
      setUploadError('Error: ' + err.message)
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const deleteStory = async (storyId: string) => {
    const supabase = createClient()
    await supabase.from('stories').delete().eq('id', storyId)

    if (viewingUser) {
      const remaining = viewingUser.stories.filter(s => s.id !== storyId)
      if (remaining.length === 0) {
        setViewingUser(null)
        setStoryIndex(0)
      } else {
        setViewingUser({ ...viewingUser, stories: remaining })
        if (storyIndex >= remaining.length) setStoryIndex(remaining.length - 1)
      }
    }
    fetchStories()
  }

  const openStoryViewer = (userStories: UserStories) => {
    setViewingUser(userStories)
    setStoryIndex(0)
  }

  const nextStory = () => {
    if (!viewingUser) return
    if (storyIndex < viewingUser.stories.length - 1) {
      setStoryIndex(i => i + 1)
      setProgress(0)
    } else {
      setViewingUser(null)
      setStoryIndex(0)
    }
  }

  const prevStory = () => {
    if (!viewingUser) return
    if (storyIndex > 0) {
      setStoryIndex(i => i - 1)
      setProgress(0)
    }
  }

  const timeLeft = (expires: string) => {
    const diff = new Date(expires).getTime() - Date.now()
    const hours = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    if (hours > 0) return `${hours}h`
    return `${mins}m`
  }

  const myStories = groupedStories.find(g => g.user_id === userId)
  const otherStories = groupedStories.filter(g => g.user_id !== userId)
  const currentStory = viewingUser?.stories[storyIndex]
  const isMyStory = viewingUser?.user_id === userId

  return (
    <>
      {/* Story viewer */}
      {viewingUser && currentStory && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center" onClick={() => { setViewingUser(null); setStoryIndex(0) }}>
          <div className="relative w-full max-w-sm h-full max-h-screen" onClick={e => e.stopPropagation()}>
            {/* Progress bars — one per story */}
            <div className="absolute top-0 left-0 right-0 z-10 p-3 flex gap-1">
              {viewingUser.stories.map((s, i) => (
                <div key={s.id} className="flex-1 bg-white bg-opacity-30 rounded-full h-1 overflow-hidden">
                  <div className="bg-white h-1 transition-all" style={{
                    width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%'
                  }} />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-6 left-0 right-0 z-10 flex items-center gap-3 px-4">
              <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                {viewingUser.avatar_url
                  ? <img src={viewingUser.avatar_url} alt={viewingUser.username} className="w-full h-full object-cover" />
                  : viewingUser.username[0].toUpperCase()}
              </div>
              <span className="text-white font-semibold text-sm">{isMyStory ? 'Your story' : viewingUser.username}</span>
              <span className="text-white text-opacity-70 text-xs">{timeLeft(currentStory.expires_at)} left</span>
              <div className="ml-auto flex items-center gap-3">
                {isMyStory && (
                  <button onClick={() => deleteStory(currentStory.id)} className="text-white text-lg" title="Delete story">🗑️</button>
                )}
                <button onClick={() => { setViewingUser(null); setStoryIndex(0) }} className="text-white text-2xl">×</button>
              </div>
            </div>

            {/* Tap zones for navigation */}
            <div className="absolute inset-0 flex z-[5]">
              <div className="w-1/3 h-full" onClick={prevStory} />
              <div className="w-1/3 h-full" />
              <div className="w-1/3 h-full" onClick={nextStory} />
            </div>

            {/* Media */}
            <div className="w-full h-full flex items-center justify-center bg-black">
              {currentStory.video_url
                ? <video key={currentStory.id} src={currentStory.video_url} autoPlay className="w-full h-full object-contain" />
                : <img key={currentStory.id} src={currentStory.image_url!} alt="story" className="w-full h-full object-contain" />
              }
            </div>
          </div>
        </div>
      )}

      {/* Stories row */}
      <div className="rounded-2xl border p-4 mb-5 shadow-sm" style={{ background: 'white', borderColor: '#F0EFF8' }}>
        {uploadError && <p className="text-red-500 text-xs mb-2">{uploadError}</p>}
        <div className="flex gap-4 overflow-x-auto pb-1">

          {/* My story circle */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            {myStories ? (
              <button onClick={() => openStoryViewer(myStories)}
                className="relative w-14 h-14 rounded-full p-0.5"
                style={{ background: myStories.allViewed ? '#E5E7EB' : 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-white flex items-center justify-center"
                  style={{ background: '#F3F4F6' }}>
                  {myStories.avatar_url
                    ? <img src={myStories.avatar_url} alt="me" className="w-full h-full object-cover" />
                    : <span className="font-bold text-lg" style={{ color: '#6366F1' }}>{email[0]?.toUpperCase()}</span>
                  }
                </div>
                <div onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                  <span className="text-white text-xs font-bold">+</span>
                </div>
              </button>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="relative w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center transition overflow-hidden"
                style={{ borderColor: '#C7D2FE', background: '#EEF2FF' }}>
                {uploading
                  ? <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  : <span className="text-2xl font-light" style={{ color: '#6366F1' }}>+</span>
                }
              </button>
            )}
            <span className="text-xs" style={{ color: '#9CA3AF' }}>
              {myStories ? `Your story (${myStories.stories.length})` : 'Your story'}
            </span>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={uploadStory} className="hidden" />
          </div>

          {/* Other users' stories */}
          {otherStories.map(userStories => (
            <div key={userStories.user_id} className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <button onClick={() => openStoryViewer(userStories)}
                className="w-14 h-14 rounded-full p-0.5"
                style={{ background: userStories.allViewed ? '#E5E7EB' : 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-white flex items-center justify-center"
                  style={{ background: '#F3F4F6' }}>
                  {userStories.avatar_url
                    ? <img src={userStories.avatar_url} alt={userStories.username} className="w-full h-full object-cover" />
                    : <span className="font-bold text-lg" style={{ color: '#6366F1' }}>{userStories.username[0].toUpperCase()}</span>
                  }
                </div>
              </button>
              <span className="text-xs truncate w-14 text-center" style={{ color: '#9CA3AF' }}>{userStories.username}</span>
            </div>
          ))}

          {otherStories.length === 0 && !myStories && (
            <div className="flex items-center text-xs ml-2" style={{ color: '#9CA3AF' }}>No stories yet — add yours!</div>
          )}
        </div>
      </div>
    </>
  )
}