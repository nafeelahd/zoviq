'use client'

import { useEffect, useState, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import CallModal from '@/components/CallModal'
import IncomingCall from '@/components/IncomingCall'
import { insertNotification } from '@/lib/notifications'

type Profile = { id: string; username: string; avatar_url: string | null; last_seen: string | null }
type Message = { id: string; sender_id: string; receiver_id: string; content: string; image_url: string | null; video_url: string | null; read: boolean; created_at: string }

export default function MessagesPage() {
  const [userId, setUserId] = useState('')
  const [people, setPeople] = useState<Profile[]>([])
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [messageError, setMessageError] = useState('')
  const [otherTyping, setOtherTyping] = useState(false)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [callType, setCallType] = useState<'video' | 'audio' | null>(null)
  const [roomUrl, setRoomUrl] = useState('')
  const [meetingToken, setMeetingToken] = useState('')
  const [startingCall, setStartingCall] = useState(false)
  const [callError, setCallError] = useState('')
  const [callName, setCallName] = useState('')
  const [incomingCall, setIncomingCall] = useState<{ callerName: string; callType: 'video' | 'audio'; roomName: string; notifId: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const msgPollRef = useRef<NodeJS.Timeout | null>(null)
  const peoplePollRef = useRef<NodeJS.Timeout | null>(null)
  const userIdRef = useRef('')
  const selectedUserRef = useRef<Profile | null>(null)
  const incomingCallRef = useRef<typeof incomingCall>(null)
  const callTypeRef = useRef<typeof callType>(null)
  const checkingCallsRef = useRef(false)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)
  const typingSubscribedRef = useRef(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const otherTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  incomingCallRef.current = incomingCall
  callTypeRef.current = callType

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      const uid = data.session.user.id
      setUserId(uid)
      userIdRef.current = uid
      fetchPeople(uid)
      peoplePollRef.current = setInterval(() => fetchPeople(uid), 30000)
      // Poll for incoming calls every 3s
      pollRef.current = setInterval(() => checkIncomingCalls(uid), 3000)
    })
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (msgPollRef.current) clearInterval(msgPollRef.current)
      if (peoplePollRef.current) clearInterval(peoplePollRef.current)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    selectedUserRef.current = selectedUser
    setAttachmentFile(null)
    setMessageError('')
    // Clear old message polling
    if (msgPollRef.current) clearInterval(msgPollRef.current)
    if (!selectedUser || !userIdRef.current) return

    // Fetch immediately
    fetchMessages(userIdRef.current, selectedUser.id)

    // Poll every 2 seconds for new messages
    msgPollRef.current = setInterval(() => {
      if (selectedUserRef.current && userIdRef.current) {
        fetchMessages(userIdRef.current, selectedUserRef.current.id)
      }
    }, 2000)

    return () => {
      if (msgPollRef.current) clearInterval(msgPollRef.current)
    }
  }, [selectedUser])

  useEffect(() => {
    if (!selectedUser || !userId) return

    const supabase = createClient()
    const channel = supabase.channel(
      `dm-typing-${[userId, selectedUser.id].sort().join('-')}`,
      { config: { broadcast: { self: false } } }
    )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId === userId) return
        if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
        setOtherTyping(Boolean(payload?.isTyping))
        if (payload?.isTyping) {
          otherTypingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2000)
        }
      })
      .subscribe(status => {
        typingSubscribedRef.current = status === 'SUBSCRIBED'
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Typing indicator channel ${status.toLowerCase()}`)
        }
      })

    typingChannelRef.current = channel
    return () => {
      typingSubscribedRef.current = false
      typingChannelRef.current = null
      setOtherTyping(false)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current)
      void supabase.removeChannel(channel)
    }
  }, [selectedUser?.id, userId])

  const fetchPeople = async (uid: string) => {
    const supabase = createClient()
    const { data, error } = await supabase.from('profiles').select('id, username, avatar_url, last_seen').neq('id', uid)
    if (error) {
      console.error('Could not load people:', error)
    } else if (data) {
      setPeople(data)
    }
    setLoading(false)
  }

  const fetchMessages = async (uid: string, otherId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true })
    if (data) {
      setMessages(prev => {
        // Only update if messages changed
        if (JSON.stringify(prev.map(m => m.id)) === JSON.stringify(data.map((m: Message) => m.id))) return prev
        return data
      })
    }
    // Mark as read
    await supabase.from('messages').update({ read: true })
      .eq('sender_id', otherId).eq('receiver_id', uid).eq('read', false)
  }

  const sendTyping = (isTyping: boolean) => {
    if (!typingChannelRef.current || !typingSubscribedRef.current) return
    void typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping },
    }).then(status => {
      if (status !== 'ok') console.error(`Typing indicator broadcast failed: ${status}`)
    }).catch(error => console.error('Typing indicator broadcast failed:', error))
  }

  const handleMessageChange = (value: string) => {
    setNewMessage(value)
    setMessageError('')
    const isTyping = Boolean(value.trim())
    sendTyping(isTyping)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => sendTyping(false), 1200)
    }
  }

  const selectAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAttachmentFile(null)
    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(file.type)
    const isVideo = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v'].includes(file.type)
    if (!isImage && !isVideo) {
      setMessageError('Choose a JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, MOV, or OGG file.')
      return
    }
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      setMessageError(isVideo ? 'Videos must be 50 MB or smaller.' : 'Images must be 10 MB or smaller.')
      return
    }
    setMessageError('')
    setAttachmentFile(file)
  }

  const sendMessage = async () => {
    if ((!newMessage.trim() && !attachmentFile) || !selectedUser || sending) return
    const text = newMessage.trim()
    setSending(true)
    setMessageError('')
    sendTyping(false)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)

    const supabase = createClient()
    let uploadedAttachmentPath: string | null = null
    try {
      let imageUrl: string | null = null
      let videoUrl: string | null = null
      if (attachmentFile) {
        const imageExtensions: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp',
          'image/avif': 'avif',
        }
        const videoExtensions: Record<string, string> = {
          'video/mp4': 'mp4',
          'video/webm': 'webm',
          'video/quicktime': 'mov',
          'video/ogg': 'ogv',
          'video/x-m4v': 'm4v',
        }
        const isVideo = attachmentFile.type.startsWith('video/')
        const extension = (isVideo ? videoExtensions : imageExtensions)[attachmentFile.type]
        if (!extension) throw new Error('Unsupported attachment type')
        const path = `messages/${userId}/${selectedUser.id}/${Date.now()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('posts').upload(path, attachmentFile, {
          cacheControl: '3600',
          contentType: attachmentFile.type,
          upsert: false,
        })
        if (uploadError) throw new Error(`Could not upload attachment: ${uploadError.message}`)
        uploadedAttachmentPath = path
        const publicUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl
        if (isVideo) videoUrl = publicUrl
        else imageUrl = publicUrl
      }

      const { data: inserted, error } = await supabase
        .from('messages')
        .insert({
          sender_id: userId,
          receiver_id: selectedUser.id,
          content: text || (imageUrl ? '📷 Image' : videoUrl ? '📹 Video' : ''),
          image_url: imageUrl,
          video_url: videoUrl,
        })
        .select()
        .single()
      if (error) throw new Error(`Could not send message: ${error.message}`)
      if (!inserted) throw new Error('Message was not returned after sending')

      setMessages(prev => [...prev, inserted])
      setNewMessage('')
      setAttachmentFile(null)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      await insertNotification(supabase, { user_id: selectedUser.id, actor_id: userId, type: 'message' })
    } catch (error) {
      if (uploadedAttachmentPath) {
        const { error: cleanupError } = await supabase.storage.from('posts').remove([uploadedAttachmentPath])
        if (cleanupError) console.error('Could not remove unsent message attachment:', cleanupError)
      }
      console.error('Could not send message:', error)
      setMessageError(error instanceof Error ? error.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false
    const timestamp = Date.parse(lastSeen)
    return Number.isFinite(timestamp) && Date.now() - timestamp < 75000
  }

  const lastSeenLabel = (lastSeen: string | null) => {
    if (!lastSeen) return 'Offline'
    const timestamp = Date.parse(lastSeen)
    if (!Number.isFinite(timestamp)) return 'Offline'
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
    if (seconds < 60) return 'Last seen just now'
    if (seconds < 3600) return `Last seen ${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `Last seen ${Math.floor(seconds / 3600)}h ago`
    return `Last seen ${Math.floor(seconds / 86400)}d ago`
  }

  const checkIncomingCalls = async (uid: string) => {
    if (checkingCallsRef.current || incomingCallRef.current || callTypeRef.current) return
    checkingCallsRef.current = true
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', uid)
        .in('type', ['video_call', 'audio_call'])
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(1)

      if (data && data.length > 0 && !incomingCallRef.current && !callTypeRef.current) {
        const notif = data[0]
        const { data: profile } = await supabase.from('profiles').select('username').eq('id', notif.actor_id).single()
        const type: 'video' | 'audio' = notif.type === 'video_call' ? 'video' : 'audio'
        const roomName = notif.call_room || (notif.group_id
          ? `group-${notif.group_id}`
          : `dm-${[uid, notif.actor_id].sort().join('-')}`)

        let callerName = profile?.username || 'Someone'
        if (notif.group_id) {
          const { data: group } = await supabase.from('groups').select('name').eq('id', notif.group_id).maybeSingle()
          callerName = group?.name || callerName
        }

        const nextIncomingCall = { callerName, callType: type, roomName, notifId: notif.id }
        incomingCallRef.current = nextIncomingCall
        setIncomingCall(nextIncomingCall)
      }
    } catch (error) {
      console.error('Could not check incoming calls:', error)
    } finally {
      checkingCallsRef.current = false
    }
  }

  const startCall = async (type: 'video' | 'audio') => {
    if (!selectedUser) return
    setStartingCall(true)
    setCallError('')
    try {
      const roomName = `dm-${[userId, selectedUser.id].sort().join('-')}`
      const res = await fetch('/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url || !data.token) throw new Error(data.error || 'Could not create the call room')

      const supabase = createClient()
      await insertNotification(supabase, {
        user_id: selectedUser.id,
        actor_id: userId,
        type: type === 'video' ? 'video_call' : 'audio_call',
        call_room: roomName,
        read: false,
      })

      setRoomUrl(data.url)
      setMeetingToken(data.token)
      setCallName(selectedUser.username)
      setCallType(type)
    } catch (error) {
      console.error('Could not start call:', error)
      setCallError(error instanceof Error ? error.message : 'Could not start the call')
    } finally {
      setStartingCall(false)
    }
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    setCallError('')
    try {
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: incomingCall.roomName }),
      })
      const callData = await res.json().catch(() => ({}))
      if (!res.ok || !callData.url || !callData.token) {
        throw new Error(callData.error || 'Could not authorize this call')
      }

      const supabase = createClient()
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', incomingCall.notifId)
      if (error) throw new Error(`Could not accept call: ${error.message}`)

      setRoomUrl(callData.url)
      setMeetingToken(callData.token)
      setCallName(incomingCall.callerName)
      setCallType(incomingCall.callType)
      callTypeRef.current = incomingCall.callType
      incomingCallRef.current = null
      setIncomingCall(null)
    } catch (error) {
      console.error('Could not accept call:', error)
      setCallError(error instanceof Error ? error.message : 'Could not authorize this call')
    }
  }

  const declineCall = async () => {
    if (!incomingCall) return
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('id', incomingCall.notifId)
    incomingCallRef.current = null
    setIncomingCall(null)
  }

  const timeAgo = (date: string) => {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    return `${Math.floor(s / 86400)}d`
  }

  const Avatar = ({ person, size = 10 }: { person: Profile; size?: number }) => (
    <div className={`w-${size} h-${size} rounded-full overflow-hidden flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', fontSize: size > 8 ? '18px' : '13px' }}>
      {person.avatar_url ? <img src={person.avatar_url} alt={person.username} className="w-full h-full object-cover" /> : person.username[0].toUpperCase()}
    </div>
  )
  const selectedLastSeen = selectedUser
    ? people.find(person => person.id === selectedUser.id)?.last_seen || selectedUser.last_seen
    : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="messages" />
      {callError && <p role="alert" className="max-w-4xl mx-auto mt-3 px-4 text-sm text-red-600">{callError}</p>}
      {incomingCall && !callType && <IncomingCall callerName={incomingCall.callerName} callType={incomingCall.callType} onAccept={acceptCall} onDecline={declineCall} />}
      {callType && roomUrl && meetingToken && <CallModal roomUrl={roomUrl} meetingToken={meetingToken} callType={callType} callerName={callName} onLeave={() => { callTypeRef.current = null; setCallType(null); setRoomUrl(''); setMeetingToken(''); setCallName('') }} />}

      <main className="max-w-4xl mx-auto py-6 px-4">
        <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)', height: '78vh' }}>
          <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-72 flex flex-col flex-shrink-0 border-r" style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>Messages</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
                ) : people.length === 0 ? (
                  <div className="text-center p-8" style={{ color: 'var(--muted)' }}><p className="text-2xl mb-2">👥</p><p className="text-xs">No users yet</p></div>
                ) : people.map(person => (
                  <button key={person.id} onClick={() => setSelectedUser(person)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 transition text-left border-b"
                    style={{ background: selectedUser?.id === person.id ? '#EEF2FF' : 'transparent', borderColor: 'var(--border)', borderLeft: selectedUser?.id === person.id ? '3px solid #6366F1' : '3px solid transparent' }}>
                    <Avatar person={person} size={10} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{person.username}</p>
                      <p className="text-xs mt-0.5" style={{ color: isOnline(person.last_seen) ? '#10B981' : 'var(--muted)' }}>
                        {isOnline(person.last_seen) ? '● Online' : lastSeenLabel(person.last_seen)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedUser ? (
                <>
                  <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <Avatar person={selectedUser} size={9} />
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{selectedUser.username}</p>
                        <p className="text-xs" style={{ color: isOnline(selectedLastSeen) ? '#10B981' : 'var(--muted)' }}>
                          {isOnline(selectedLastSeen)
                            ? '● Online'
                            : lastSeenLabel(selectedLastSeen)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startCall('audio')} disabled={startingCall}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:scale-105 disabled:opacity-40"
                        style={{ background: '#F0FDF4' }}>📞</button>
                      <button onClick={() => startCall('video')} disabled={startingCall}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:scale-105 disabled:opacity-40"
                        style={{ background: '#EEF2FF' }}>📹</button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <p className="text-4xl mb-3">👋</p>
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Say hi to {selectedUser.username}!</p>
                      </div>
                    ) : messages.map(msg => {
                      const isMe = msg.sender_id === userId
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
                          {!isMe && <Avatar person={selectedUser} size={7} />}
                          <div className="max-w-xs">
                            <div className={`overflow-hidden rounded-2xl text-sm shadow-sm ${isMe ? 'rounded-br-sm text-white' : 'rounded-bl-sm'}`}
                              style={isMe ? { background: 'linear-gradient(135deg, #6366F1, #EC4899)' } : { background: 'var(--hover-bg)', color: 'var(--text)' }}>
                              {msg.image_url && <a href={msg.image_url} target="_blank" rel="noreferrer"><img src={msg.image_url} alt="Image attachment" className="max-h-64 max-w-full object-contain" /></a>}
                              {msg.video_url && <video src={msg.video_url} controls playsInline preload="metadata" className="max-h-64 max-w-full bg-black" aria-label="Video attachment" />}
                              {msg.content && msg.content !== '📷 Image' && msg.content !== '📹 Video' && <p className="px-4 py-2.5">{msg.content}</p>}
                            </div>
                            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>{timeAgo(msg.created_at)}</p>
                              {isMe && <span className="text-xs" style={{ color: msg.read ? '#3B82F6' : 'var(--muted)' }}>{msg.read ? '✓✓' : '✓'}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {otherTyping && (
                      <p className="text-xs px-2" style={{ color: 'var(--muted)' }} aria-live="polite">
                        {selectedUser.username} is typing…
                      </p>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    {messageError && <p role="alert" className="mb-2 text-xs text-red-600">{messageError}</p>}
                    {attachmentFile && (
                      <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                        <span className="truncate">{attachmentFile.type.startsWith('video/') ? 'Video' : 'Image'}: {attachmentFile.name}</span>
                        <button type="button" onClick={() => setAttachmentFile(null)} aria-label="Remove attachment" className="text-red-500">Remove</button>
                      </div>
                    )}
                    <div className="flex gap-3 items-center">
                      <input type="text" value={newMessage}
                        onChange={e => handleMessageChange(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        placeholder={`Message ${selectedUser.username}...`}
                        className="flex-1 text-sm rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 border"
                        style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                      <label className="w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer border"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }} title="Attach image or video">
                        <span aria-hidden="true">📎</span>
                        <input type="file" accept="image/*,video/*" onChange={selectAttachment} className="hidden" />
                      </label>
                      <button onClick={sendMessage} disabled={(!newMessage.trim() && !attachmentFile) || sending}
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white transition hover:opacity-90 disabled:opacity-40 shadow-md flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                        {sending ? '...' : '➤'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                    <span className="text-3xl">💬</span>
                  </div>
                  <h3 className="font-bold text-base mb-1" style={{ color: 'var(--text)' }}>Your Messages</h3>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>Select a person to start chatting</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}