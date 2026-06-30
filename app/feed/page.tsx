'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import VideoEditor from '@/components/VideoEditor'
import Stories from '@/components/Stories'
import Navbar from '@/components/Navbar'
import ShareModal from '@/components/ShareModal'

type Comment = { id: string; content: string; created_at: string; user_id: string }
type Post = {
  id: string; content: string; image_url: string | null; video_url: string | null
  created_at: string; user_id: string
  likes: { user_id: string }[]; comments: Comment[]
  username?: string; avatar_url?: string | null
}

export default function FeedPage() {
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [myProfile, setMyProfile] = useState<{ username: string; avatar_url: string | null } | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [content, setContent] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [showVideoEditor, setShowVideoEditor] = useState(false)
  const [videoTrim, setVideoTrim] = useState<{ start: number; end: number } | null>(null)
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [shareTarget, setShareTarget] = useState<{ url: string; title: string; type: 'post' | 'profile' | 'story' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      setEmail(data.session.user.email || '')
      setUserId(data.session.user.id)
      fetchMyProfile(data.session.user.id)
      fetchPosts()
    })
  }, [])

  const fetchMyProfile = async (uid: string) => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('username, avatar_url').eq('id', uid).single()
    if (data) setMyProfile(data)
  }

  const fetchPosts = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('posts')
      .select('*, likes(user_id), comments(id, content, created_at, user_id)')
      .order('created_at', { ascending: false })

    if (!data) { setLoading(false); return }

    // Get profiles for all post authors
    const userIds = [...new Set(data.map(p => p.user_id))] as string[]
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
    const profileMap: Record<string, any> = {}
    profiles?.forEach(p => { profileMap[p.id] = p })

    setPosts(data.map(p => ({ ...p, username: profileMap[p.user_id]?.username || 'user', avatar_url: profileMap[p.user_id]?.avatar_url || null })))
    setLoading(false)
  }

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { setError('Max file size is 50MB.'); return }
    const isVideo = file.type.startsWith('video/')
    setMediaFile(file); setMediaPreview(URL.createObjectURL(file))
    setMediaType(isVideo ? 'video' : 'image'); setError('')
    if (isVideo) setShowVideoEditor(true)
  }

  const handleVideoEditorDone = (file: File, start: number, end: number) => {
    setMediaFile(file); setVideoTrim({ start, end }); setShowVideoEditor(false)
  }

  const removeMedia = () => {
    setMediaFile(null); setMediaPreview(null); setMediaType(null)
    setVideoTrim(null); setShowVideoEditor(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const createPost = async () => {
    if (!content.trim() && !mediaFile) return
    setPosting(true); setError('')
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPosting(false); return }

    let image_url = null, video_url = null
    if (mediaFile) {
      const ext = mediaFile.name.split('.').pop()
      const path = `${session.user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('posts').upload(path, mediaFile)
      if (uploadError) { setError('Upload failed: ' + uploadError.message); setPosting(false); return }
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
      if (mediaType === 'video') video_url = urlData.publicUrl
      else image_url = urlData.publicUrl
    }

    const { error } = await supabase.from('posts').insert({ content: content.trim(), user_id: session.user.id, image_url, video_url })
    if (error) { setError('Post failed: ' + error.message); setPosting(false); return }
    setContent(''); setMediaFile(null); setMediaPreview(null); setMediaType(null); setVideoTrim(null)
    if (fileRef.current) fileRef.current.value = ''
    setPosting(false); fetchPosts()
  }

  const deletePost = async (id: string) => {
    const supabase = createClient()
    await supabase.from('posts').delete().eq('id', id)
    fetchPosts()
  }

  const toggleLike = async (postId: string, liked: boolean, postOwnerId: string) => {
    const supabase = createClient()
    if (liked) {
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId)
    } else {
      await supabase.from('likes').insert({ post_id: postId, user_id: userId })
      if (postOwnerId !== userId) {
        await supabase.from('notifications').insert({ user_id: postOwnerId, actor_id: userId, type: 'like', post_id: postId })
      }
    }
    fetchPosts()
  }

  const addComment = async (postId: string, postOwnerId: string) => {
    if (!commentText.trim()) return
    const supabase = createClient()
    await supabase.from('comments').insert({ post_id: postId, user_id: userId, content: commentText.trim() })
    if (postOwnerId !== userId) {
      await supabase.from('notifications').insert({ user_id: postOwnerId, actor_id: userId, type: 'comment', post_id: postId })
    }
    setCommentText(''); fetchPosts()
  }

  const deleteComment = async (commentId: string) => {
    const supabase = createClient()
    await supabase.from('comments').delete().eq('id', commentId)
    fetchPosts()
  }

  const timeAgo = (date: string) => {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  const Avatar = ({ name, url, size = 9 }: { name: string; url?: string | null; size?: number }) => (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden`}
      style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', fontSize: size > 8 ? '16px' : '12px' }}>
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : name[0]?.toUpperCase()}
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {showVideoEditor && mediaFile && (
        <VideoEditor file={mediaFile} onDone={handleVideoEditorDone} onCancel={removeMedia} />
      )}
      {shareTarget && (
        <ShareModal url={shareTarget.url} title={shareTarget.title} type={shareTarget.type} onClose={() => setShareTarget(null)} />
      )}
      <Navbar activePage="feed" />

      <main className="max-w-xl mx-auto py-6 px-4">
        {/* Stories */}
        {userId && <Stories userId={userId} email={email} />}

        {/* Create post */}
        <div className="rounded-2xl border p-5 mb-5 shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex gap-3 mb-3">
            <Avatar name={myProfile?.username || email} url={myProfile?.avatar_url} size={10} />
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="What's on your mind?" rows={2} maxLength={500}
              className="flex-1 text-sm resize-none focus:outline-none bg-transparent pt-1"
              style={{ color: 'var(--text)' }} />
          </div>

          {mediaPreview && !showVideoEditor && (
            <div className="relative mt-2 rounded-xl overflow-hidden bg-black mb-3">
              {mediaType === 'video'
                ? <video src={mediaPreview} controls className="w-full max-h-64 rounded-xl" />
                : <img src={mediaPreview} alt="preview" className="w-full max-h-64 object-cover rounded-xl" />
              }
              <button onClick={removeMedia} className="absolute top-2 right-2 bg-black bg-opacity-60 text-white rounded-full w-7 h-7 flex items-center justify-center text-lg">×</button>
              {videoTrim && <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded-lg">✂️ {Math.floor(videoTrim.end - videoTrim.start)}s</div>}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1">
              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.click() } }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-80 transition"
                style={{ background: '#EEF2FF', color: '#6366F1' }}>📷 Photo</button>
              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'video/*'; fileRef.current.click() } }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium hover:opacity-80 transition"
                style={{ background: '#FDF2F8', color: '#EC4899' }}>🎬 Video</button>
              <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />
              <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>{content.length}/500</span>
            </div>
            <button onClick={createPost} disabled={posting || (!content.trim() && !mediaFile)}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        </div>

        {/* Feed */}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Loading feed...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-4xl mb-3">✨</p>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>No posts yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Be the first to share something!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => {
              const liked = post.likes?.some(l => l.user_id === userId)
              const likeCount = post.likes?.length || 0
              const commentCount = post.comments?.length || 0
              const showComments = openComments === post.id

              return (
                <div key={post.id} className="rounded-2xl border shadow-sm overflow-hidden"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 pb-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={post.username || 'user'} url={post.avatar_url} size={10} />
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{post.username || email.split('@')[0]}</p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{timeAgo(post.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setShareTarget({ url: `/feed`, title: `Check out this post on Zoviq!`, type: 'post' })}
                        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition text-lg" title="Share">📤</button>
                      {post.user_id === userId && (
                        <button onClick={() => deletePost(post.id)}
                          className="text-xs px-2 py-1 rounded-lg hover:bg-red-50 hover:text-red-400 transition"
                          style={{ color: 'var(--muted)' }}>delete</button>
                      )}
                    </div>
                  </div>

                  {/* Media */}
                  {post.image_url && <img src={post.image_url} alt="post" className="w-full max-h-96 object-cover" />}
                  {post.video_url && <video src={post.video_url} controls className="w-full max-h-96 bg-black" playsInline />}

                  {/* Content */}
                  {post.content && <p className="text-sm leading-relaxed px-4 pt-3 pb-1" style={{ color: 'var(--text)' }}>{post.content}</p>}

                  {/* Actions */}
                  <div className="flex items-center gap-1 px-3 py-2 mt-1">
                    <button onClick={() => toggleLike(post.id, !!liked, post.user_id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition ${liked ? 'text-red-500' : 'hover:bg-gray-50'}`}
                      style={!liked ? { color: 'var(--muted)' } : {}}>
                      {liked ? '❤️' : '🤍'} {likeCount > 0 ? likeCount : 'Like'}
                    </button>
                    <button onClick={() => setOpenComments(showComments ? null : post.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition hover:bg-gray-50"
                      style={{ color: showComments ? '#6366F1' : '#9CA3AF' }}>
                      💬 {commentCount > 0 ? commentCount : 'Comment'}
                    </button>
                    <button onClick={() => setShareTarget({ url: `/feed`, title: `Check out this post on Zoviq!`, type: 'post' })}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition hover:bg-gray-50 ml-auto"
                      style={{ color: 'var(--muted)' }}>
                      📤 Share
                    </button>
                  </div>

                  {/* Comments */}
                  {showComments && (
                    <div className="px-4 pb-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                      {post.comments?.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {post.comments.map(comment => (
                            <div key={comment.id} className="flex items-start gap-2">
                              <Avatar name={post.username || 'user'} url={post.avatar_url} size={7} />
                              <div className="flex-1 rounded-xl px-3 py-2" style={{ background: 'var(--bg)' }}>
                                <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--text)' }}>{post.username || email.split('@')[0]}</p>
                                <p className="text-xs" style={{ color: 'var(--sub)' }}>{comment.content}</p>
                              </div>
                              {comment.user_id === userId && (
                                <button onClick={() => deleteComment(comment.id)} className="text-xs mt-2 hover:text-red-400 transition" style={{ color: 'var(--muted)' }}>×</button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addComment(post.id, post.user_id)}
                          placeholder="Write a comment..."
                          className="flex-1 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 border"
                          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                        <button onClick={() => addComment(post.id, post.user_id)} disabled={!commentText.trim()}
                          className="text-white text-xs px-3 py-2 rounded-xl disabled:opacity-40 transition"
                          style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>Send</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}