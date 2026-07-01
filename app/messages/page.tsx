'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import CallModal from '@/components/CallModal'
import IncomingCall from '@/components/IncomingCall'

type Profile = { id: string; username: string; avatar_url: string | null }
type Message = { id: string; sender_id: string; receiver_id: string; content: string; read: boolean; created_at: string }

export default function MessagesPage() {
  const [userId, setUserId] = useState('')
  const [people, setPeople] = useState<Profile[]>([])
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [callType, setCallType] = useState<'video' | 'audio' | null>(null)
  const [roomUrl, setRoomUrl] = useState('')
  const [startingCall, setStartingCall] = useState(false)
  const [incomingCall, setIncomingCall] = useState<{ callerName: string; callType: 'video' | 'audio'; roomUrl: string; notifId: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const selectedUserRef = useRef<Profile | null>(null)
  const userIdRef = useRef('')
  const channelRef = useRef<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      const uid = data.session.user.id
      setUserId(uid)
      userIdRef.current = uid
      fetchPeople(uid)
      pollRef.current = setInterval(() => checkIncomingCalls(uid), 3000)
    })
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (channelRef.current) channelRef.current.unsubscribe()
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    selectedUserRef.current = selectedUser
    if (!selectedUser || !userId) return

    // Fetch messages immediately
    fetchMessages(userId, selectedUser.id)

    // Clean up previous channel
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }

    // Set up real-time subscription
    const supabase = createClient()
    const channel = supabase
      .channel(`messages-${userId}-${selectedUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload: any) => {
        const msg = payload.new as Message
        const currentUser = userIdRef.current
        const currentSelected = selectedUserRef.current
        // Only add if it's relevant to this conversation
        if (
          (msg.sender_id === currentUser && msg.receiver_id === currentSelected?.id) ||
          (msg.sender_id === currentSelected?.id && msg.receiver_id === currentUser)
        ) {
          setMessages(prev => {
            // Avoid duplicates
            if (prev.find(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // Mark as read if received
          if (msg.sender_id === currentSelected?.id) {
            supabase.from('messages').update({ read: true }).eq('id', msg.id).then(() => {})
          }
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
      })
      .subscribe()

    channelRef.current = channel
  }, [selectedUser, userId])

  const checkIncomingCalls = async (uid: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .in('type', ['video_call', 'audio_call'])
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(1)

    if (data && data.length > 0 && !incomingCall && !callType) {
      const notif = data[0]
      const { data: profile } = await supabase.from('profiles').select('username').eq('id', notif.actor_id).single()
      const type = notif.type === 'video_call' ? 'video' : 'audio'
      const roomName = notif.call_room || `dm-${[uid, notif.actor_id].sort().join('-')}`
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName })
      })
      const roomData = await res.json()
      if (roomData.url) {
        setIncomingCall({ callerName: profile?.username || 'Someone', callType: type, roomUrl: roomData.url, notifId: notif.id })
      }
    }
  }

  const fetchPeople = async (uid: string) => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('id, username, avatar_url').neq('id', uid)
    setPeople(data || [])
    setLoading(false)
  }

  const fetchMessages = async (uid: string, otherId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    // Mark received messages as read
    await supabase.from('messages').update({ read: true }).eq('sender_id', otherId).eq('receiver_id', uid).eq('read', false)
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedUser || sending) return
    const text = newMessage.trim()
    setNewMessage('')
    setSending(true)

    const supabase = createClient()
    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({ sender_id: userId, receiver_id: selectedUser.id, content: text })
      .select()
      .single()

    if (!error && inserted) {
      // Add to local state immediately for instant feedback
      setMessages(prev => [...prev, inserted])
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      // Send notification
      await supabase.from('notifications').insert({ user_id: selectedUser.id, actor_id: userId, type: 'message' })
    }
    setSending(false)
  }

  const startCall = async (type: 'video' | 'audio') => {
    if (!selectedUser) return
    setStartingCall(true)
    try {
      const roomName = `dm-${[userId, selectedUser.id].sort().join('-')}`
      const res = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName })
      })
      const data = await res.json()
      if (data.url) {
        setRoomUrl(data.url)
        setCallType(type)
        const supabase = createClient()
        await supabase.from('notifications').insert({
          user_id: selectedUser.id,
          actor_id: userId,
          type: type === 'video' ? 'video_call' : 'audio_call',
          call_room: roomName,
          read: false,
        })
      } else {
        alert('Could not start call. Please check your Daily.co API key.')
      }
    } catch (e) {
      console.error('Call error:', e)
      alert('Call failed. Please try again.')
    }
    setStartingCall(false)
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('id', incomingCall.notifId)
    setRoomUrl(incomingCall.roomUrl)
    setCallType(incomingCall.callType)
    setIncomingCall(null)
  }

  const declineCall = async () => {
    if (!incomingCall) return
    const supabase = createClient()
    await supabase.from('notifications').update({ read: true }).eq('id', incomingCall.notifId)
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

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="messages" />

      {incomingCall && !callType && (
        <IncomingCall callerName={incomingCall.callerName} callType={incomingCall.callType} onAccept={acceptCall} onDecline={declineCall} />
      )}
      {callType && roomUrl && (
        <CallModal roomUrl={roomUrl} callType={callType} callerName={selectedUser?.username || 'User'} onLeave={() => { setCallType(null); setRoomUrl('') }} />
      )}

      <main className="max-w-4xl mx-auto py-6 px-4">
        <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)', height: '78vh' }}>
          <div className="flex h-full">

            {/* Left sidebar */}
            <div className="w-72 flex flex-col flex-shrink-0 border-r" style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>Messages</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : people.length === 0 ? (
                  <div className="text-center p-8" style={{ color: 'var(--muted)' }}>
                    <p className="text-2xl mb-2">👥</p>
                    <p className="text-xs">No users yet</p>
                  </div>
                ) : people.map(person => (
                  <button key={person.id} onClick={() => setSelectedUser(person)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 transition text-left border-b"
                    style={{
                      background: selectedUser?.id === person.id ? '#EEF2FF' : 'transparent',
                      borderColor: 'var(--border)',
                      borderLeft: selectedUser?.id === person.id ? '3px solid #6366F1' : '3px solid transparent'
                    }}>
                    <Avatar person={person} size={10} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{person.username}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Tap to message</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat area */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedUser ? (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <Avatar person={selectedUser} size={9} />
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{selectedUser.username}</p>
                        <p className="text-xs" style={{ color: '#10B981' }}>● Online</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startCall('audio')} disabled={startingCall}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:scale-105 disabled:opacity-40"
                        style={{ background: '#F0FDF4' }} title="Audio call">
                        <span className="text-lg">📞</span>
                      </button>
                      <button onClick={() => startCall('video')} disabled={startingCall}
                        className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:scale-105 disabled:opacity-40"
                        style={{ background: '#EEF2FF' }} title="Video call">
                        <span className="text-lg">📹</span>
                      </button>
                    </div>
                  </div>

                  {/* Messages */}
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
                            <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isMe ? 'rounded-br-sm text-white' : 'rounded-bl-sm'}`}
                              style={isMe
                                ? { background: 'linear-gradient(135deg, #6366F1, #EC4899)' }
                                : { background: 'var(--hover-bg)', color: 'var(--text)' }}>
                              <p>{msg.content}</p>
                            </div>
                            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                              <p className="text-xs" style={{ color: 'var(--muted)' }}>{timeAgo(msg.created_at)}</p>
                              {isMe && <span className="text-xs" style={{ color: msg.read ? '#3B82F6' : 'var(--muted)' }}>{msg.read ? '✓✓' : '✓'}</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input */}
                  <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex gap-3 items-center">
                      <input type="text" value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder={`Message ${selectedUser.username}...`}
                        className="flex-1 text-sm rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 border"
                        style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                      <button onClick={sendMessage} disabled={!newMessage.trim() || sending}
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white transition hover:opacity-90 disabled:opacity-40 shadow-md flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                        {sending ? '...' : '➤'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
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