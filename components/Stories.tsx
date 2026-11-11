'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import CameraCapture from '@/components/CameraCapture'
import { muteVideo } from '@/lib/muteVideo'

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
  const [showCamera, setShowCamera] = useState(false)
  const [pendingStoryVideo, setPendingStoryVideo] = useState<File | null>(null)
  const [muteStoryVideo, setMuteStoryVideo] = useState(false)
  const [storyPreviewUrl, setStoryPreviewUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const progressRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { fetchStories() }, [userId])

  useEffect(() => {
    if (!pendingStoryVideo) {
      setStoryPreviewUrl('')
      return
    }

    const previewUrl = URL.createObjectURL(pendingStoryVideo)
    setStoryPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [pendingStoryVideo])

  useEffect(() => {
    if (viewingUser) {
      setProgress(0)
      const currentStory = viewingUser.stories[storyIndex]
      if (currentStory && viewingUser.user_id !== userId) markViewed(currentStory.id)

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

  const openStoryCamera = () => setShowCamera(true)

  const openStoryGallery = () => {
    if (!fileRef.current) return
    fileRef.current.value = ''
    fileRef.current.click()
  }

  const handleStoryFile = (file?: File) => {
    if (!file) return
    if (file.type.startsWith('video/')) {
      setPendingStoryVideo(file)
      setMuteStoryVideo(false)
      setUploadError('')
      return
    }
    void uploadStory(file)
  }

  const uploadStory = async (sourceFile: File, mute = false) => {
    setUploading(true)
    setUploadError('')

    try {
      const file = mute ? await muteVideo(sourceFile) : sourceFile
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `stories/${userId}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage.from('posts').upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message)

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
      const isVideo = file.type.startsWith('video/')

      const { error: insertErr } = await supabase.from('stories').insert({
        user_id: userId,
        image_url: isVideo ? null : urlData.publicUrl,
        video_url: isVideo ? urlData.publicUrl : null,
      })

      if (insertErr) throw new Error('Story failed: ' + insertErr.message)
      await fetchStories()
      return true
    } catch (err) {
      console.error('Could not upload story:', err)
      setUploadError(err instanceof Error ? err.message : 'Could not upload story')
      return false
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const publishStoryVideo = async () => {
    if (!pendingStoryVideo || uploading) return
    const uploaded = await uploadStory(pendingStoryVideo, muteStoryVideo)
    if (uploaded) {
      setPendingStoryVideo(null)
      setMuteStoryVideo(false)
    }
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
      {showCamera && (
        <CameraCapture
          onCapture={file => { setShowCamera(false); handleStoryFile(file) }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {pendingStoryVideo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Preview story video">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-gray-950 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <h2 className="font-semibold">Preview story video</h2>
              <button type="button" onClick={() => { setPendingStoryVideo(null); setMuteStoryVideo(false) }} disabled={uploading}
                className="rounded-lg px-3 py-1 text-2xl disabled:opacity-40" aria-label="Close preview">×</button>
            </div>
            {storyPreviewUrl && (
              <video src={storyPreviewUrl} controls playsInline className="max-h-[65vh] w-full bg-black object-contain" aria-label="Story video preview" />
            )}
            <div className="space-y-4 p-4">
              <label className="flex items-center gap-2 text-sm text-white">
                <input type="checkbox" checked={muteStoryVideo} onChange={e => setMuteStoryVideo(e.target.checked)} disabled={uploading} />
                Mute video audio
              </label>
              {muteStoryVideo && <p className="text-xs text-gray-300">The video will be processed without sound before upload.</p>}
              {uploadError && <p role="alert" className="text-sm text-red-300">{uploadError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setPendingStoryVideo(null); setMuteStoryVideo(false) }} disabled={uploading}
                  className="flex-1 rounded-xl border border-gray-600 py-2.5 text-sm font-medium text-white disabled:opacity-40">
                  Cancel
                </button>
                <button type="button" onClick={() => void publishStoryVideo()} disabled={uploading}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {uploading ? (muteStoryVideo ? 'Processing…' : 'Uploading…') : 'Share story'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
      <div className="rounded-2xl border p-4 mb-5 shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        {uploadError && <p className="text-red-500 text-xs mb-2">{uploadError}</p>}
        <div className="flex gap-4 overflow-x-auto pb-1">

          {/* My story circle */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            {myStories ? (
              <button onClick={() => openStoryViewer(myStories)}
                className="relative w-14 h-14 rounded-full p-0.5"
                style={{ background: myStories.allViewed ? 'var(--border)' : 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 flex items-center justify-center"
                  style={{ background: 'var(--surface-solid)', borderColor: 'var(--card)' }}>
                  {myStories.avatar_url
                    ? <img src={myStories.avatar_url} alt="me" className="w-full h-full object-cover" />
                    : <span className="font-bold text-lg" style={{ color: '#6366F1' }}>{email[0]?.toUpperCase()}</span>
                  }
                </div>
                <div onClick={(e) => { e.stopPropagation(); openStoryCamera() }}
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                  <span className="text-white text-xs font-bold">+</span>
                </div>
              </button>
            ) : (
              <button onClick={() => openStoryCamera()} disabled={uploading}
                className="relative w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center transition overflow-hidden"
                style={{ borderColor: '#818CF8', background: 'var(--hover-bg)' }}>
                {uploading
                  ? <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  : <span className="text-2xl font-light" style={{ color: '#6366F1' }}>+</span>
                }
              </button>
            )}
            <span className="text-xs" style={{ color: '#9CA3AF' }}>
              {myStories ? `Your story (${myStories.stories.length})` : 'Your story'}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={openStoryCamera} disabled={uploading}
                className="rounded-lg px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                style={{ background: '#EEF2FF', color: '#6366F1' }}>
                Camera
              </button>
              <button type="button" onClick={openStoryGallery} disabled={uploading}
                className="rounded-lg px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                style={{ background: '#F3F4F6', color: '#4B5563' }}>
                Gallery
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={e => { handleStoryFile(e.target.files?.[0]); e.target.value = '' }} className="hidden" />
          </div>

          {/* Other users' stories */}
          {otherStories.map(userStories => (
            <div key={userStories.user_id} className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <button onClick={() => openStoryViewer(userStories)}
                className="w-14 h-14 rounded-full p-0.5"
                style={{ background: userStories.allViewed ? 'var(--border)' : 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                <div className="w-full h-full rounded-full overflow-hidden border-2 flex items-center justify-center"
                  style={{ background: 'var(--surface-solid)', borderColor: 'var(--card)' }}>
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