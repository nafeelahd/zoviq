'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import CallModal from '@/components/CallModal'
import IncomingCall from '@/components/IncomingCall'
import { insertNotification } from '@/lib/notifications'
import { removeMessageAttachments } from '@/lib/messageAttachments'

type Profile = { id: string; username: string; avatar_url: string | null; last_seen: string | null }
type Message = { id: string; sender_id: string; receiver_id: string; content: string; image_url: string | null; video_url: string | null; audio_url: string | null; read: boolean; created_at: string }

const directConversationId = (userA: string, userB: string) => [userA, userB].sort().join(':')

export default function MessagesPage() {
  const [userId, setUserId] = useState('')
  const [people, setPeople] = useState<Profile[]>([])
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentKind, setAttachmentKind] = useState<'image' | 'video' | 'audio' | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [messageError, setMessageError] = useState('')
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceSeconds, setVoiceSeconds] = useState(0)
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
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const voiceTimerRef = useRef<NodeJS.Timeout | null>(null)

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
    if (!attachmentFile || attachmentKind !== 'audio') {
      setAudioPreviewUrl(null)
      return
    }

    const previewUrl = URL.createObjectURL(attachmentFile)
    setAudioPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [attachmentFile, attachmentKind])

  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current)
      if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
        audioRecorderRef.current.stop()
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

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
    const conversationId = directConversationId(uid, otherId)
    const [{ data, error }, { data: hiddenRows, error: hiddenError }] = await Promise.all([
      supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true }),
      supabase.from('message_hidden_for').select('message_id')
        .eq('user_id', uid).eq('message_type', 'direct').eq('conversation_id', conversationId),
    ])
    if (error) {
      console.error('Could not load messages:', error)
      setMessageError('Could not load messages. Please try again.')
      return
    }
    if (hiddenError) {
      console.error('Could not load hidden messages:', hiddenError)
      setMessageError('Could not load message visibility settings. Run the updated Supabase setup SQL.')
      return
    }
    if (data) {
      const hiddenIds = new Set(hiddenRows?.map(row => row.message_id) || [])
      const visibleMessages = data.filter(message => !hiddenIds.has(message.id))
      setMessages(prev => {
        // Only update if messages changed
        if (JSON.stringify(prev.map(m => m.id)) === JSON.stringify(visibleMessages.map(m => m.id))) return prev
        return visibleMessages
      })
    }
    setMessageError('')
    // Mark as read
    await supabase.from('messages').update({ read: true })
      .eq('sender_id', otherId).eq('receiver_id', uid).eq('read', false)
  }

  const deleteMessage = async (message: Message, mode: 'me' | 'everyone') => {
    if (!selectedUser || deletingMessageId) return
    if (mode === 'everyone' && !window.confirm('Delete this message for everyone? This cannot be undone.')) return

    setDeletingMessageId(message.id)
    setMessageError('')
    const supabase = createClient()
    try {
      if (mode === 'me') {
        const { error } = await supabase.from('message_hidden_for').insert({
          user_id: userId,
          message_type: 'direct',
          conversation_id: directConversationId(userId, selectedUser.id),
          message_id: message.id,
        })
        if (error) throw new Error(`Could not delete message for you: ${error.message}`)
      } else {
        const { data, error } = await supabase.from('messages').delete()
          .eq('id', message.id).eq('sender_id', userId).select('id').maybeSingle()
        if (error) throw new Error(`Could not delete message for everyone: ${error.message}`)
        if (!data) throw new Error('You can delete for everyone only the messages you sent.')
        setMessages(current => current.filter(item => item.id !== message.id))
        try {
          await removeMessageAttachments(supabase, [message.image_url, message.video_url, message.audio_url])
        } catch (cleanupError) {
          console.error('Message deleted but attached media cleanup failed:', cleanupError)
          setMessageError(`Message deleted for everyone, but attached media could not be removed: ${cleanupError instanceof Error ? cleanupError.message : 'storage cleanup failed'}`)
        }
        return
      }
      setMessages(current => current.filter(item => item.id !== message.id))
    } catch (error) {
      console.error('Could not delete direct message:', error)
      setMessageError(error instanceof Error ? error.message : 'Could not delete message')
    } finally {
      setDeletingMessageId(null)
    }
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
    setAttachmentKind(null)

    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(file.type)
    const isVideo = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v'].includes(file.type)
    const isAudio = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav'].includes(file.type)
    if (!isImage && !isVideo && !isAudio) {
      setMessageError('Choose a JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, MOV, OGG, MP3, M4A, WAV, or voice recording file.')
      return
    }
    const maxSize = isVideo ? 50 * 1024 * 1024 : isAudio ? 20 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      setMessageError(isVideo ? 'Videos must be 50 MB or smaller.' : isAudio ? 'Voice notes must be 20 MB or smaller.' : 'Images must be 10 MB or smaller.')
      return
    }
    setAttachmentKind(isAudio ? 'audio' : isVideo ? 'video' : 'image')
    setMessageError('')
    setAttachmentFile(file)
  }

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessageError('Voice recording is not supported in this browser.')
      return
    }

    try {
      setMessageError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (audioBlob.size === 0) {
          setAttachmentFile(null)
          setAttachmentKind(null)
          return
        }
        const extension = audioBlob.type.includes('mp4') ? 'm4a' : audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('wav') ? 'wav' : 'webm'
        const file = new File([audioBlob], `voice-message-${Date.now()}.${extension}`, { type: audioBlob.type || 'audio/webm' })
        setAttachmentFile(file)
        setAttachmentKind('audio')
        stream.getTracks().forEach(track => track.stop())
      }
      recorder.start()
      audioRecorderRef.current = recorder
      audioStreamRef.current = stream
      setIsRecordingVoice(true)
      setVoiceSeconds(0)
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current)
      voiceTimerRef.current = setInterval(() => setVoiceSeconds(value => value + 1), 1000)
    } catch (error) {
      console.error('Could not start voice recording:', error)
      setMessageError('Microphone access was denied or unavailable.')
    }
  }

  const stopVoiceRecording = () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current)
      voiceTimerRef.current = null
    }
    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      audioRecorderRef.current.stop()
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }
    setIsRecordingVoice(false)
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
      let audioUrl: string | null = null
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
        const audioExtensions: Record<string, string> = {
          'audio/mpeg': 'mp3',
          'audio/mp3': 'mp3',
          'audio/mp4': 'm4a',
          'audio/webm': 'webm',
          'audio/ogg': 'ogg',
          'audio/wav': 'wav',
          'audio/x-wav': 'wav',
        }
        const isVideo = attachmentFile.type.startsWith('video/')
        const isAudio = attachmentFile.type.startsWith('audio/') || attachmentKind === 'audio'
        const contentType = attachmentFile.type.split(';', 1)[0].trim().toLowerCase()
        const extension = isVideo ? videoExtensions[contentType] : isAudio ? audioExtensions[contentType] : imageExtensions[contentType]
        if (!extension) throw new Error('Unsupported attachment type')
        const path = `messages/${userId}/${selectedUser.id}/${Date.now()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('posts').upload(path, attachmentFile, {
          cacheControl: '3600',
          contentType,
          upsert: false,
        })
        if (uploadError) throw new Error(`Could not upload attachment: ${uploadError.message}`)
        uploadedAttachmentPath = path
        const publicUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl
        if (isAudio) audioUrl = publicUrl
        else if (isVideo) videoUrl = publicUrl
        else imageUrl = publicUrl
      }

      const { data: inserted, error } = await supabase
        .from('messages')
        .insert({
          sender_id: userId,
          receiver_id: selectedUser.id,
          content: text || (audioUrl ? '🎙️ Voice message' : imageUrl ? '📷 Image' : videoUrl ? '📹 Video' : ''),
          image_url: imageUrl,
          video_url: videoUrl,
          audio_url: audioUrl,
        })
        .select()
        .single()
      if (error) throw new Error(`Could not send message: ${error.message}`)
      if (!inserted) throw new Error('Message was not returned after sending')

      setMessages(prev => [...prev, inserted])
      setNewMessage('')
      setAttachmentFile(null)
      setAttachmentKind(null)
      setVoiceSeconds(0)
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
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('You must be signed in to start a call')

      const roomName = `dm-${[userId, selectedUser.id].sort().join('-')}`
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ roomName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url || !data.token) throw new Error(data.error || 'Could not create the call room')

      const notificationRes = await fetch('/api/call/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          roomName,
          recipientId: selectedUser.id,
          callType: type,
        }),
      })
      const notificationData = await notificationRes.json().catch(() => ({}))
      if (!notificationRes.ok) {
        throw new Error(notificationData.error || 'Could not notify the other person about the call')
      }

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
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('You must be signed in to accept a call')

      const res = await fetch('/api/call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ roomName: incomingCall.roomName }),
      })
      const callData = await res.json().catch(() => ({}))
      if (!res.ok || !callData.url || !callData.token) {
        throw new Error(callData.error || 'Could not authorize this call')
      }

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

      <main className="max-w-4xl mx-auto py-6 px-4 max-md:px-0 max-md:py-0">
        <div className="messages-panel rounded-2xl border shadow-sm overflow-hidden max-md:rounded-none max-md:border-x-0" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex h-full">
            {/* Sidebar */}
            <div className={`w-72 flex flex-col flex-shrink-0 border-r ${selectedUser ? 'hidden md:flex' : ''} max-md:w-full max-md:border-r-0`} style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>Messages</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
                ) : people.length === 0 ? (
                  <div className="text-center p-8" style={{ color: 'var(--muted)' }}><p className="text-2xl mb-2">👥</p><p className="text-xs">No users yet</p></div>
                ) : people.map(person => (
                  <div key={person.id} className="flex items-center gap-2 px-3 border-b"
                    style={{ background: selectedUser?.id === person.id ? '#EEF2FF' : 'transparent', borderColor: 'var(--border)', borderLeft: selectedUser?.id === person.id ? '3px solid #6366F1' : '3px solid transparent' }}>
                    <Link href={`/profile/${encodeURIComponent(person.id)}`} aria-label={`View ${person.username} profile`}>
                      <Avatar person={person} size={10} />
                    </Link>
                    <div className="flex-1 min-w-0 py-3.5">
                      <Link href={`/profile/${encodeURIComponent(person.id)}`} className="text-sm font-semibold truncate hover:underline" style={{ color: 'var(--text)' }}>{person.username}</Link>
                      <p className="text-xs mt-0.5" style={{ color: isOnline(person.last_seen) ? '#10B981' : 'var(--muted)' }}>
                        {isOnline(person.last_seen) ? '● Online' : lastSeenLabel(person.last_seen)}
                      </p>
                    </div>
                    <button type="button" onClick={() => setSelectedUser(person)} aria-label={`Message ${person.username}`}
                      className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-black/5" style={{ color: '#6366F1' }}>✉</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className={`flex-1 flex-col min-w-0 ${selectedUser ? 'flex' : 'hidden md:flex'}`}>
              {selectedUser ? (
                <>
                  <div className="flex items-center justify-between px-5 py-3.5 border-b max-md:px-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setSelectedUser(null)} aria-label="Back to conversations"
                        className="hidden max-md:flex w-9 h-9 rounded-xl items-center justify-center"
                        style={{ background: 'var(--hover-bg)', color: 'var(--text)' }}>
                        ←
                      </button>
                      <Link href={`/profile/${encodeURIComponent(selectedUser.id)}`} className="flex items-center gap-3 group">
                        <Avatar person={selectedUser} size={9} />
                        <div>
                        <p className="font-semibold text-sm group-hover:underline" style={{ color: 'var(--text)' }}>{selectedUser.username}</p>
                        <p className="text-xs" style={{ color: isOnline(selectedLastSeen) ? '#10B981' : 'var(--muted)' }}>
                          {isOnline(selectedLastSeen)
                            ? '● Online'
                            : lastSeenLabel(selectedLastSeen)}
                        </p>
                      </div>
                      </Link>
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

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-md:px-3">
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
                              {msg.audio_url && <audio src={msg.audio_url} controls className="max-w-full" style={{ maxWidth: 240 }} />}
                              {msg.content && msg.content !== '📷 Image' && msg.content !== '📹 Video' && msg.content !== '🎙️ Voice message' && <p className="px-4 py-2.5">{msg.content}</p>}
                            </div>
                            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>{timeAgo(msg.created_at)}</p>
                              {isMe && <span className="text-xs" style={{ color: msg.read ? '#3B82F6' : 'var(--muted)' }}>{msg.read ? '✓✓' : '✓'}</span>}
                              <details className="relative">
                                <summary className="list-none cursor-pointer rounded px-1 text-xs" style={{ color: 'var(--muted)' }} aria-label="Message options">⋯</summary>
                                <div className="absolute right-0 z-20 mt-1 min-w-36 rounded-xl border p-1 shadow-lg"
                                  style={{ background: 'var(--surface-solid)', borderColor: 'var(--border)' }}>
                                  <button type="button" disabled={deletingMessageId === msg.id}
                                    onClick={event => {
                                      event.currentTarget.closest('details')?.removeAttribute('open')
                                      void deleteMessage(msg, 'me')
                                    }}
                                    className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-gray-100 disabled:opacity-50"
                                    style={{ color: 'var(--text)' }}>
                                    Delete for me
                                  </button>
                                  {isMe && (
                                    <button type="button" disabled={deletingMessageId === msg.id}
                                      onClick={event => {
                                        event.currentTarget.closest('details')?.removeAttribute('open')
                                        void deleteMessage(msg, 'everyone')
                                      }}
                                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                                      Delete for everyone
                                    </button>
                                  )}
                                </div>
                              </details>
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

                  <div className="px-5 py-4 border-t max-md:px-3 max-md:py-3" style={{ borderColor: 'var(--border)' }}>
                    {messageError && <p role="alert" className="mb-2 text-xs text-red-600">{messageError}</p>}
                    {attachmentFile && (
                      <div className="mb-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--input-bg)' }}>
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                          <span className="truncate">{attachmentKind === 'audio' ? 'Voice message preview' : attachmentKind === 'video' ? 'Video' : 'Image'}: {attachmentFile.name}</span>
                          <button type="button" onClick={() => { setAttachmentFile(null); setAttachmentKind(null) }} aria-label="Remove attachment" className="flex-shrink-0 text-red-500">Remove</button>
                        </div>
                        {attachmentKind === 'audio' && audioPreviewUrl && (
                          <audio src={audioPreviewUrl} controls preload="metadata" className="w-full" aria-label="Voice message preview" />
                        )}
                      </div>
                    )}
                    <div className="flex gap-3 items-center">
                      <input type="text" value={newMessage}
                        onChange={e => handleMessageChange(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        placeholder={`Message ${selectedUser.username}...`}
                        className="flex-1 min-w-0 text-sm rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 border"
                        style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                      <button type="button" onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center border transition ${isRecordingVoice ? 'animate-pulse' : ''}`}
                        style={{ borderColor: isRecordingVoice ? '#F43F5E' : 'var(--border)', background: isRecordingVoice ? '#FEE2E2' : 'var(--input-bg)', color: isRecordingVoice ? '#DC2626' : 'var(--muted)' }}
                        title={isRecordingVoice ? 'Stop voice message' : 'Record voice message'}>
                        <span aria-hidden="true">{isRecordingVoice ? '■' : '🎙️'}</span>
                      </button>
                      {isRecordingVoice && <span className="text-xs font-medium" style={{ color: '#DC2626' }}>{voiceSeconds}s</span>}
                      <label className="w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer border"
                        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }} title="Attach image, video, or audio">
                        <span aria-hidden="true">📎</span>
                        <input type="file" accept="image/*,video/*,audio/*" onChange={selectAttachment} className="hidden" />
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