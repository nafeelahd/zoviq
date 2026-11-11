'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import CallModal from '@/components/CallModal'
import { insertNotification, insertNotifications } from '@/lib/notifications'
import { removeMessageAttachments } from '@/lib/messageAttachments'

type Group = { id: string; name: string; description: string | null; image_url: string | null; created_by: string; created_at: string; privacy: 'public' | 'private'; member_count: number; is_member: boolean; request_status: 'none' | 'pending' | 'accepted' }
type GroupMessage = { id: string; content: string; created_at: string; user_id: string; username: string; image_url: string | null; video_url: string | null; audio_url: string | null }
type Member = { id: string; user_id: string; role: string; username: string; avatar_url: string | null }
type JoinRequest = { id: string; user_id: string; username: string; created_at: string }

export default function GroupsPage() {
  const [userId, setUserId] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentKind, setAttachmentKind] = useState<'image' | 'video' | 'audio' | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceSeconds, setVoiceSeconds] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showRequests, setShowRequests] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [groupPrivacy, setGroupPrivacy] = useState<'public' | 'private'>('public')
  const [groupImage, setGroupImage] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [allUsers, setAllUsers] = useState<{id: string; username: string; avatar_url: string | null}[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [callType, setCallType] = useState<'video' | 'audio' | null>(null)
  const [roomUrl, setRoomUrl] = useState('')
  const [meetingToken, setMeetingToken] = useState('')
  const [startingCall, setStartingCall] = useState(false)
  const [callError, setCallError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const voiceTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { window.location.href = '/auth/login'; return }
      const uid = data.session.user.id
      setUserId(uid)
      await fetchGroups(uid)
      fetchAllUsers(uid)
      const params = new URLSearchParams(window.location.search)
      const groupId = params.get('id')
      if (groupId) {
        const { data: groupData } = await supabase.from('groups').select('*').eq('id', groupId).single()
        if (groupData) {
          const { data: memberData } = await supabase.from('group_members').select('*').eq('group_id', groupId)
          const isMember = memberData?.some(m => m.user_id === uid) || false
          setSelectedGroup({ ...groupData, member_count: memberData?.length || 0, is_member: isMember, request_status: isMember ? 'accepted' : 'none' })
        }
      }
    })
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
    if (!selectedGroup || !userId) return
    fetchMessages(selectedGroup.id)
    fetchMembers(selectedGroup.id)
    if (selectedGroup.created_by === userId) fetchJoinRequests(selectedGroup.id)
    const supabase = createClient()
    const channel = supabase.channel(`group-${selectedGroup.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${selectedGroup.id}` }, () => fetchMessages(selectedGroup.id))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' }, () => fetchMessages(selectedGroup.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedGroup?.id, userId])

  const fetchGroups = async (uid: string) => {
    const supabase = createClient()
    const { data: groupsData } = await supabase.from('groups').select('*').order('created_at', { ascending: false })
    const { data: membersData } = await supabase.from('group_members').select('group_id, user_id')
    const { data: requestsData } = await supabase.from('group_requests').select('group_id, status').eq('user_id', uid)
    const memberMap: Record<string, number> = {}
    const myGroups = new Set<string>()
    membersData?.forEach(m => { memberMap[m.group_id] = (memberMap[m.group_id] || 0) + 1; if (m.user_id === uid) myGroups.add(m.group_id) })
    const requestMap: Record<string, string> = {}
    requestsData?.forEach(r => { requestMap[r.group_id] = r.status })
    setGroups((groupsData || []).map((g: any) => ({ ...g, member_count: memberMap[g.id] || 0, is_member: myGroups.has(g.id), request_status: myGroups.has(g.id) ? 'accepted' : (requestMap[g.id] || 'none') })))
    setLoading(false)
  }

  const fetchMessages = async (groupId: string) => {
    const supabase = createClient()
    const [{ data: msgs, error }, { data: hiddenRows, error: hiddenError }] = await Promise.all([
      supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true }),
      supabase.from('message_hidden_for').select('message_id')
        .eq('user_id', userId).eq('message_type', 'group').eq('conversation_id', groupId),
    ])
    if (error) {
      console.error('Could not load group messages:', error)
      setSendError('Could not load group messages. Please try again.')
      return
    }
    if (hiddenError) {
      console.error('Could not load hidden group messages:', hiddenError)
      setSendError('Could not load message visibility settings. Run the updated Supabase setup SQL.')
      return
    }
    if (!msgs || msgs.length === 0) { setMessages([]); return }
    const hiddenIds = new Set(hiddenRows?.map(row => row.message_id) || [])
    const visibleMessages = msgs.filter(message => !hiddenIds.has(message.id))
    if (visibleMessages.length === 0) { setMessages([]); setSendError(''); return }
    const userIds = Array.from(new Set(visibleMessages.map(m => m.user_id))) as string[]
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.username })
    setMessages(visibleMessages.map(m => ({ ...m, username: profileMap[m.user_id] || 'user' })))
    setSendError('')
  }

  const fetchMembers = async (groupId: string) => {
    const supabase = createClient()
    const { data: mems } = await supabase.from('group_members').select('*').eq('group_id', groupId)
    if (!mems) { setMembers([]); return }
    const userIds = mems.map(m => m.user_id)
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
    const profileMap: Record<string, any> = {}
    profiles?.forEach(p => { profileMap[p.id] = p })
    setMembers(mems.map(m => ({ ...m, username: profileMap[m.user_id]?.username || 'user', avatar_url: profileMap[m.user_id]?.avatar_url || null })))
  }

  const fetchJoinRequests = async (groupId: string) => {
    const supabase = createClient()
    const { data: reqs } = await supabase.from('group_requests').select('*').eq('group_id', groupId).eq('status', 'pending')
    if (!reqs || reqs.length === 0) { setJoinRequests([]); return }
    const userIds = reqs.map(r => r.user_id)
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', userIds)
    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.username })
    setJoinRequests(reqs.map(r => ({ ...r, username: profileMap[r.user_id] || 'user' })))
  }

  const fetchAllUsers = async (uid: string) => {
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('id, username, avatar_url').neq('id', uid)
    setAllUsers(data || [])
  }

  const createGroup = async () => {
    if (!groupName.trim()) return
    setCreating(true)
    const supabase = createClient()
    let image_url = null
    if (groupImage) {
      const ext = groupImage.name.split('.').pop()
      const path = `groups/${userId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('posts').upload(path, groupImage)
      if (!error) { const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path); image_url = urlData.publicUrl }
    }
    const { data: newGroup, error } = await supabase.from('groups').insert({ name: groupName.trim(), description: groupDesc.trim() || null, image_url, created_by: userId, privacy: groupPrivacy }).select().single()
    if (!error && newGroup) await supabase.from('group_members').insert({ group_id: newGroup.id, user_id: userId, role: 'admin' })
    setGroupName(''); setGroupDesc(''); setGroupImage(null); setGroupPrivacy('public'); setShowCreate(false); setCreating(false)
    fetchGroups(userId)
  }

  const requestToJoin = async (group: Group) => {
    const supabase = createClient()
    if (group.privacy === 'public') {
      await supabase.from('group_members').insert({ group_id: group.id, user_id: userId, role: 'member' })
      await insertNotification(supabase, { user_id: group.created_by, actor_id: userId, type: 'group_join', group_id: group.id })
    } else {
      await supabase.from('group_requests').upsert({ group_id: group.id, user_id: userId, status: 'pending' })
      await insertNotification(supabase, { user_id: group.created_by, actor_id: userId, type: 'group_request', group_id: group.id })
    }
    fetchGroups(userId)
  }

  const acceptRequest = async (request: JoinRequest) => {
    const supabase = createClient()
    await supabase.from('group_members').upsert({ group_id: selectedGroup!.id, user_id: request.user_id, role: 'member' })
    await supabase.from('group_requests').update({ status: 'accepted' }).eq('id', request.id)
    await insertNotification(supabase, { user_id: request.user_id, actor_id: userId, type: 'group_accepted', group_id: selectedGroup!.id })
    fetchJoinRequests(selectedGroup!.id); fetchMembers(selectedGroup!.id); fetchGroups(userId)
  }

  const rejectRequest = async (requestId: string) => {
    const supabase = createClient()
    await supabase.from('group_requests').delete().eq('id', requestId)
    fetchJoinRequests(selectedGroup!.id)
  }

  const addUserDirectly = async (targetUserId: string) => {
    const supabase = createClient()
    await supabase.from('group_members').upsert({ group_id: selectedGroup!.id, user_id: targetUserId, role: 'member' })
    await supabase.from('group_requests').delete().eq('group_id', selectedGroup!.id).eq('user_id', targetUserId)
    await insertNotification(supabase, { user_id: targetUserId, actor_id: userId, type: 'group_added', group_id: selectedGroup!.id })
    fetchMembers(selectedGroup!.id); fetchGroups(userId)
  }

  const removeMember = async (memberId: string, memberUserId: string) => {
    const supabase = createClient()
    await supabase.from('group_members').delete().eq('id', memberId)
    await insertNotification(supabase, { user_id: memberUserId, actor_id: userId, type: 'group_removed', group_id: selectedGroup!.id })
    fetchMembers(selectedGroup!.id); fetchGroups(userId)
  }

  const leaveGroup = async () => {
    const supabase = createClient()
    await supabase.from('group_members').delete().eq('group_id', selectedGroup!.id).eq('user_id', userId)
    setSelectedGroup(null); fetchGroups(userId)
  }

  const deleteGroup = async () => {
    const supabase = createClient()
    await supabase.from('groups').delete().eq('id', selectedGroup!.id)
    setSelectedGroup(null); fetchGroups(userId)
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
      setSendError('Choose a JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, MOV, OGG, MP3, M4A, WAV, or voice recording file.')
      return
    }

    const maxSize = isVideo ? 50 * 1024 * 1024 : isAudio ? 20 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      setSendError(isVideo ? 'Videos must be 50 MB or smaller.' : isAudio ? 'Voice notes must be 20 MB or smaller.' : 'Images must be 10 MB or smaller.')
      return
    }

    setAttachmentKind(isAudio ? 'audio' : isVideo ? 'video' : 'image')
    setSendError('')
    setAttachmentFile(file)
  }

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setSendError('Voice recording is not supported in this browser.')
      return
    }

    try {
      setSendError('')
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
      setSendError('Microphone access was denied or unavailable.')
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
    if ((!newMessage.trim() && !attachmentFile) || !selectedGroup) return
    setSending(true); setSendError('')
    const supabase = createClient()
    let uploadedAttachmentPath: string | null = null
    try {
      let imageUrl: string | null = null
      let videoUrl: string | null = null
      let audioUrl: string | null = null
      if (attachmentFile) {
        const isVideo = attachmentFile.type.startsWith('video/')
        const isAudio = attachmentFile.type.startsWith('audio/') || attachmentKind === 'audio'
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
        const contentType = attachmentFile.type.split(';', 1)[0].trim().toLowerCase()
        const extension = isVideo ? videoExtensions[contentType] : isAudio ? audioExtensions[contentType] : imageExtensions[contentType]
        if (!extension) throw new Error('Unsupported attachment type')
        const path = `group-messages/${userId}/${selectedGroup.id}/${Date.now()}.${extension}`
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

      const { error } = await supabase.from('group_messages').insert({
        group_id: selectedGroup.id,
        user_id: userId,
        content: newMessage.trim() || (audioUrl ? '🎙️ Voice message' : videoUrl ? '📹 Video' : imageUrl ? '📷 Image' : ''),
        image_url: imageUrl,
        video_url: videoUrl,
        audio_url: audioUrl,
      })
      if (error) throw new Error(`Failed to send group message: ${error.message}`)
      const otherMembers = members.filter(m => m.user_id !== userId)
      for (const member of otherMembers) {
        await insertNotification(supabase, { user_id: member.user_id, actor_id: userId, type: 'group_message', group_id: selectedGroup.id })
      }
      setNewMessage(''); setAttachmentFile(null); setAttachmentKind(null); setVoiceSeconds(0); fetchMessages(selectedGroup.id)
    } catch (error) {
      if (uploadedAttachmentPath) {
        const { error: cleanupError } = await supabase.storage.from('posts').remove([uploadedAttachmentPath])
        if (cleanupError) console.error('Could not remove unsent group message attachment:', cleanupError)
      }
      console.error('Could not send group message:', error)
      setSendError(error instanceof Error ? error.message : 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  const deleteMessage = async (message: GroupMessage, mode: 'me' | 'everyone') => {
    if (!selectedGroup || deletingMessageId) return
    if (mode === 'everyone' && !window.confirm('Delete this message for everyone? This cannot be undone.')) return

    setDeletingMessageId(message.id)
    setSendError('')
    const supabase = createClient()
    try {
      if (mode === 'me') {
        const { error } = await supabase.from('message_hidden_for').insert({
          user_id: userId,
          message_type: 'group',
          conversation_id: selectedGroup.id,
          message_id: message.id,
        })
        if (error) throw new Error(`Could not delete message for you: ${error.message}`)
      } else {
        const { data, error } = await supabase.from('group_messages').delete()
          .eq('id', message.id).eq('user_id', userId).select('id').maybeSingle()
        if (error) throw new Error(`Could not delete message for everyone: ${error.message}`)
        if (!data) throw new Error('You can delete for everyone only the messages you sent.')
        setMessages(current => current.filter(item => item.id !== message.id))
        try {
          await removeMessageAttachments(supabase, [message.image_url, message.video_url, message.audio_url])
        } catch (cleanupError) {
          console.error('Group message deleted but attached media cleanup failed:', cleanupError)
          setSendError(`Message deleted for everyone, but attached media could not be removed: ${cleanupError instanceof Error ? cleanupError.message : 'storage cleanup failed'}`)
        }
        return
      }
      setMessages(current => current.filter(item => item.id !== message.id))
    } catch (error) {
      console.error('Could not delete group message:', error)
      setSendError(error instanceof Error ? error.message : 'Could not delete message')
    } finally {
      setDeletingMessageId(null)
    }
  }

  const startGroupCall = async (type: 'video' | 'audio') => {
    if (!selectedGroup?.is_member) return
    setStartingCall(true)
    setCallError('')
    try {
      const roomName = `group-${selectedGroup.id}`
      const res = await fetch('/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url || !data.token) throw new Error(data.error || 'Could not create the call room')

      const supabase = createClient()
      const notifications = members
        .filter(member => member.user_id !== userId)
        .map(member => ({
          user_id: member.user_id,
          actor_id: userId,
          type: type === 'video' ? 'video_call' : 'audio_call',
          group_id: selectedGroup.id,
          call_room: roomName,
          read: false,
        }))
      if (notifications.length) {
        const notificationsCreated = await insertNotifications(supabase, notifications)
        if (!notificationsCreated) throw new Error('Could not notify group members. Check your Supabase notifications table setup.')
      }

      setRoomUrl(data.url)
      setMeetingToken(data.token)
      setCallType(type)
    } catch (error) {
      console.error('Could not start group call:', error)
      setCallError(error instanceof Error ? error.message : 'Could not start the group call')
    } finally {
      setStartingCall(false)
    }
  }

  const timeAgo = (date: string) => {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    return `${Math.floor(s / 86400)}d`
  }

  const isAdmin = selectedGroup?.created_by === userId
  const filtered = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
  const myGroupsList = filtered.filter(g => g.is_member)
  const otherGroupsList = filtered.filter(g => !g.is_member)
  const nonMembers = allUsers.filter(u => !members.find(m => m.user_id === u.id)).filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase()))

  const GroupAvatar = ({ group, size = 10 }: { group: Group; size?: number }) => (
    <div className={`w-${size} h-${size} rounded-xl flex items-center justify-center font-bold text-white overflow-hidden flex-shrink-0`}
      style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', fontSize: size >= 10 ? '18px' : '13px' }}>
      {group.image_url ? <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" /> : group.name[0].toUpperCase()}
    </div>
  )

  const UserAvatar = ({ username, avatar_url, size = 9 }: { username: string; avatar_url?: string | null; size?: number }) => (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center font-bold text-white overflow-hidden flex-shrink-0`}
      style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', fontSize: size >= 9 ? '14px' : '11px' }}>
      {avatar_url ? <img src={avatar_url} alt={username} className="w-full h-full object-cover" /> : username[0].toUpperCase()}
    </div>
  )

  const GradBtn = ({ onClick, children, disabled, className = '' }: any) => (
    <button onClick={onClick} disabled={disabled}
      className={`text-white font-semibold rounded-xl transition hover:opacity-90 disabled:opacity-40 ${className}`}
      style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
      {children}
    </button>
  )

  const Modal = ({ title, onClose, children }: any) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition text-gray-400 text-xl">×</button>
        </div>
        {children}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar activePage="groups" />

      {callType && roomUrl && (
        <CallModal roomUrl={roomUrl} meetingToken={meetingToken} callType={callType} callerName={selectedGroup?.name || 'Group'} onLeave={() => { setCallType(null); setRoomUrl(''); setMeetingToken('') }} />
      )}

      <main className="max-w-5xl mx-auto py-6 px-4 max-md:px-0 max-md:py-0">
        <div className="groups-layout flex gap-5">

          {/* Left sidebar */}
          <div className={`w-72 flex-shrink-0 space-y-3 ${selectedGroup ? 'hidden md:block' : ''} max-md:w-full max-md:px-3 max-md:py-4`}>
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Groups</h1>
              <GradBtn onClick={() => setShowCreate(true)} className="px-3 py-1.5 text-sm flex items-center gap-1">
                + New
              </GradBtn>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2">🔍</span>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }} />
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                {myGroupsList.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--muted)' }}>Your Groups</p>
                    <div className="space-y-1.5">
                      {myGroupsList.map(group => (
                        <div key={group.id} onClick={() => setSelectedGroup(group)}
                          className="flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition hover:shadow-sm"
                          style={{
                            background: selectedGroup?.id === group.id ? '#EEF2FF' : 'white',
                            borderColor: selectedGroup?.id === group.id ? '#C7D2FE' : '#F0EFF8',
                            borderLeft: selectedGroup?.id === group.id ? '3px solid #6366F1' : '3px solid transparent'
                          }}>
                          <GroupAvatar group={group} size={10} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{group.name}</p>
                              {group.privacy === 'private' && <span className="text-xs">🔒</span>}
                            </div>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>{group.member_count} members</p>
                          </div>
                          {group.created_by === userId && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                              style={{ background: '#EEF2FF', color: '#6366F1' }}>Admin</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {otherGroupsList.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--muted)' }}>Discover</p>
                    <div className="space-y-1.5">
                      {otherGroupsList.map(group => (
                        <div key={group.id} className="flex items-center gap-3 p-3 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                          <GroupAvatar group={group} size={10} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{group.name}</p>
                              {group.privacy === 'private' && <span className="text-xs">🔒</span>}
                            </div>
                            <p className="text-xs" style={{ color: 'var(--muted)' }}>{group.member_count} members</p>
                          </div>
                          {group.request_status === 'pending' ? (
                            <span className="text-xs px-3 py-1.5 rounded-xl font-medium flex-shrink-0" style={{ background: '#FEF3C7', color: '#D97706' }}>Pending</span>
                          ) : (
                            <GradBtn onClick={() => requestToJoin(group)} className="px-3 py-1.5 text-xs flex-shrink-0">
                              {group.privacy === 'private' ? 'Request' : 'Join'}
                            </GradBtn>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filtered.length === 0 && (
                  <div className="text-center py-8 rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <p className="text-3xl mb-2">👥</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>No groups yet</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat panel */}
          <div className={`flex-1 min-w-0 ${selectedGroup ? 'block' : 'hidden md:block'}`}>
            {selectedGroup ? (
              <div className="groups-chat-panel rounded-2xl border shadow-sm overflow-hidden flex flex-col max-md:rounded-none max-md:border-x-0" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:px-3 max-md:py-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <button type="button" onClick={() => setSelectedGroup(null)} aria-label="Back to groups"
                      className="hidden max-md:flex w-9 h-9 rounded-xl items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--hover-bg)', color: 'var(--text)' }}>
                      ←
                    </button>
                    <GroupAvatar group={selectedGroup} size={10} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{selectedGroup.name}</p>
                        {selectedGroup.privacy === 'private' && <span className="text-xs">🔒</span>}
                        {isAdmin && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#EEF2FF', color: '#6366F1' }}>Admin</span>}
                      </div>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{selectedGroup.member_count} members</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 max-md:justify-end max-md:overflow-x-auto">
                    {isAdmin && joinRequests.length > 0 && (
                      <button onClick={() => setShowRequests(true)}
                        className="text-xs px-3 py-1.5 rounded-xl font-semibold"
                        style={{ background: '#FEF3C7', color: '#D97706' }}>
                        {joinRequests.length} Request{joinRequests.length > 1 ? 's' : ''}
                      </button>
                    )}
                    <button onClick={() => setShowMembers(true)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition text-lg" title="Members">👥</button>
                    {isAdmin && (
                      <button onClick={() => { setShowAddUser(true); setUserSearch('') }}
                        className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition text-lg" title="Add member">➕</button>
                    )}
                    <button onClick={() => startGroupCall('audio')} disabled={startingCall || !selectedGroup.is_member}
                      className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition text-lg" title="Audio call">📞</button>
                    <button onClick={() => startGroupCall('video')} disabled={startingCall || !selectedGroup.is_member}
                      className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 transition text-lg" title="Video call">📹</button>
                    {selectedGroup.is_member && !isAdmin && (
                      <button onClick={leaveGroup} className="text-xs px-3 py-1.5 rounded-xl border hover:bg-red-50 hover:text-red-500 transition" style={{ color: 'var(--sub)', borderColor: '#E5E7EB' }}>Leave</button>
                    )}
                    {isAdmin && (
                      <button onClick={deleteGroup} className="text-xs px-3 py-1.5 rounded-xl border hover:bg-red-50 hover:text-red-500 transition" style={{ color: '#EF4444', borderColor: '#FEE2E2' }}>Delete</button>
                    )}
                  </div>
                </div>

                {callError && <p role="alert" className="px-5 py-2 text-sm text-red-600">{callError}</p>}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-md:px-3">
                  {!selectedGroup.is_member ? (
                    <div className="flex items-center justify-center h-full text-center">
                      <div>
                        <p className="text-5xl mb-3">{selectedGroup.privacy === 'private' ? '🔒' : '👥'}</p>
                        <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{selectedGroup.privacy === 'private' ? 'Private Group' : 'Join to see messages'}</p>
                        {selectedGroup.request_status === 'pending' ? (
                          <p className="text-sm px-4 py-2 rounded-xl mt-3" style={{ background: '#FEF3C7', color: '#D97706' }}>Request sent — waiting for approval</p>
                        ) : (
                          <GradBtn onClick={() => requestToJoin(selectedGroup)} className="px-6 py-2.5 mt-3 text-sm">
                            {selectedGroup.privacy === 'private' ? 'Request to Join' : 'Join Group'}
                          </GradBtn>
                        )}
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center">
                      <div>
                        <p className="text-4xl mb-2">💬</p>
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>No messages yet. Say hi!</p>
                      </div>
                    </div>
                  ) : messages.map(msg => {
                    const isMe = msg.user_id === userId
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
                        {!isMe && <Link href={`/profile/${encodeURIComponent(msg.user_id)}`} aria-label={`View ${msg.username} profile`}><UserAvatar username={msg.username} size={8} /></Link>}
                        <div className="max-w-xs">
                        {!isMe && <Link href={`/profile/${encodeURIComponent(msg.user_id)}`} className="text-xs mb-1 ml-1 hover:underline block" style={{ color: 'var(--muted)' }}>{msg.username}</Link>}
                          <div className={`overflow-hidden rounded-2xl text-sm shadow-sm ${isMe ? 'rounded-br-sm text-white' : 'rounded-bl-sm'}`}
                            style={isMe ? { background: 'linear-gradient(135deg, #6366F1, #EC4899)' } : { background: '#F3F4F6', color: 'var(--text)' }}>
                            {msg.image_url && <a href={msg.image_url} target="_blank" rel="noreferrer"><img src={msg.image_url} alt="Image attachment" className="max-h-64 max-w-full object-contain" /></a>}
                            {msg.video_url && <video src={msg.video_url} controls playsInline preload="metadata" className="max-h-64 max-w-full bg-black" aria-label="Video attachment" />}
                            {msg.audio_url && <audio src={msg.audio_url} controls className="max-w-full" style={{ maxWidth: 240 }} />}
                            {msg.content && !['🎙️ Voice message', '📷 Image', '📹 Video'].includes(msg.content) && <p className="px-4 py-2.5">{msg.content}</p>}
                            <p className="px-4 pb-2.5 text-xs" style={{ color: isMe ? 'rgba(255,255,255,0.6)' : '#9CA3AF' }}>{timeAgo(msg.created_at)}</p>
                          </div>
                          <div className={`mt-1 flex ${isMe ? 'justify-end' : 'justify-start'}`}>
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
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                {selectedGroup.is_member && (
                  <div className="px-5 py-4 border-t max-md:px-3 max-md:py-3" style={{ borderColor: 'var(--border)' }}>
                    {sendError && <p className="text-red-500 text-xs mb-2">{sendError}</p>}
                    {attachmentFile && (
                      <div className="mb-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--input-bg)' }}>
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                          <span className="truncate">{attachmentKind === 'audio' ? 'Voice message preview' : attachmentKind === 'video' ? 'Video' : 'Image'}: {attachmentFile.name}</span>
                          <button type="button" onClick={() => { setAttachmentFile(null); setAttachmentKind(null) }} className="flex-shrink-0 text-red-500">Remove</button>
                        </div>
                        {attachmentKind === 'audio' && audioPreviewUrl && (
                          <audio src={audioPreviewUrl} controls preload="metadata" className="w-full" aria-label="Voice message preview" />
                        )}
                      </div>
                    )}
                    <div className="flex gap-3 items-center">
                      <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage()}
                        placeholder={`Message ${selectedGroup.name}...`}
                        className="flex-1 min-w-0 text-sm rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-300 border"
                        style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
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
                      <GradBtn onClick={sendMessage} disabled={(!newMessage.trim() && !attachmentFile) || sending} className="w-11 h-11 flex items-center justify-center shadow-md flex-shrink-0">
                        {sending ? '...' : '➤'}
                      </GradBtn>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="groups-chat-panel rounded-2xl border shadow-sm flex items-center justify-center text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div>
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                    <span className="text-3xl">👥</span>
                  </div>
                  <h3 className="font-bold text-base mb-1" style={{ color: 'var(--text)' }}>Your Groups</h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Select a group or create a new one</p>
                  <GradBtn onClick={() => setShowCreate(true)} className="px-6 py-2.5 text-sm">Create Group</GradBtn>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create group modal */}
      {showCreate && (
        <Modal title="Create Group" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div onClick={() => imageRef.current?.click()}
                className="w-16 h-16 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden border-2 border-dashed transition hover:border-indigo-400"
                style={!groupImage ? { background: '#EEF2FF', borderColor: '#C7D2FE' } : {}}>
                {groupImage ? <img src={URL.createObjectURL(groupImage)} alt="group" className="w-full h-full object-cover" /> : <span className="text-2xl">📷</span>}
              </div>
              <div><p className="text-sm font-medium" style={{ color: '#374151' }}>Group Photo</p><p className="text-xs" style={{ color: 'var(--muted)' }}>Optional</p></div>
              <input ref={imageRef} type="file" accept="image/*" onChange={e => setGroupImage(e.target.files?.[0] || null)} className="hidden" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Group Name *</label>
              <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Football Fans" maxLength={50}
                className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Description</label>
              <textarea value={groupDesc} onChange={e => setGroupDesc(e.target.value)} placeholder="What is this group about?" rows={2} maxLength={200}
                className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>Privacy</label>
              <div className="flex gap-3">
                {[{ val: 'public', icon: '🌍', label: 'Public', sub: 'Anyone can join' }, { val: 'private', icon: '🔒', label: 'Private', sub: 'Admin must approve' }].map(opt => (
                  <button key={opt.val} onClick={() => setGroupPrivacy(opt.val as any)}
                    className="flex-1 flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition"
                    style={{ borderColor: groupPrivacy === opt.val ? '#6366F1' : '#E5E7EB', background: groupPrivacy === opt.val ? '#EEF2FF' : 'transparent' }}>
                    <span className="text-xl">{opt.icon}</span>
                    <div className="text-left">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{opt.label}</p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{opt.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 border py-2.5 rounded-xl text-sm font-medium" style={{ color: 'var(--sub)', borderColor: '#E5E7EB' }}>Cancel</button>
              <GradBtn onClick={createGroup} disabled={!groupName.trim() || creating} className="flex-1 py-2.5 text-sm">
                {creating ? 'Creating...' : 'Create Group'}
              </GradBtn>
            </div>
          </div>
        </Modal>
      )}

      {/* Join requests modal */}
      {showRequests && selectedGroup && (
        <Modal title="Join Requests" onClose={() => setShowRequests(false)}>
          {joinRequests.length === 0 ? (
            <div className="text-center py-8"><p className="text-3xl mb-2">✅</p><p className="text-sm" style={{ color: 'var(--muted)' }}>No pending requests</p></div>
          ) : (
            <div className="space-y-3">
              {joinRequests.map(req => (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                  <UserAvatar username={req.username} size={10} />
                  <div className="flex-1"><p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{req.username}</p><p className="text-xs" style={{ color: 'var(--muted)' }}>{timeAgo(req.created_at)}</p></div>
                  <div className="flex gap-2">
                    <GradBtn onClick={() => acceptRequest(req)} className="px-3 py-1.5 text-xs">Accept</GradBtn>
                    <button onClick={() => rejectRequest(req.id)} className="text-xs px-3 py-1.5 rounded-xl border" style={{ color: 'var(--sub)', borderColor: '#E5E7EB' }}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Members modal */}
      {showMembers && selectedGroup && (
        <Modal title={`Members (${members.length})`} onClose={() => setShowMembers(false)}>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {members.map(member => (
              <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                <Link href={`/profile/${encodeURIComponent(member.user_id)}`} aria-label={`View ${member.username} profile`}><UserAvatar username={member.username} avatar_url={member.avatar_url} size={10} /></Link>
                <div className="flex-1"><Link href={`/profile/${encodeURIComponent(member.user_id)}`} className="text-sm font-semibold hover:underline" style={{ color: 'var(--text)' }}>{member.username}</Link><p className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{member.role}</p></div>
                {member.user_id === userId ? (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: '#6366F1' }}>You</span>
                ) : isAdmin ? (
                  <button onClick={() => removeMember(member.id, member.user_id)} className="text-xs px-3 py-1.5 rounded-xl border hover:bg-red-50 hover:text-red-500 transition" style={{ color: 'var(--sub)', borderColor: '#E5E7EB' }}>Remove</button>
                ) : null}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Add user modal */}
      {showAddUser && selectedGroup && (
        <Modal title="Add Members" onClose={() => setShowAddUser(false)}>
          <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users..."
            className="w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-4"
            style={{ borderColor: 'var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {nonMembers.length === 0 ? (
              <p className="text-center text-sm py-4" style={{ color: 'var(--muted)' }}>{userSearch ? 'No users found' : 'All users are already members'}</p>
            ) : nonMembers.map(user => (
              <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                <Link href={`/profile/${encodeURIComponent(user.id)}`} aria-label={`View ${user.username} profile`}><UserAvatar username={user.username} avatar_url={user.avatar_url} size={10} /></Link>
                <Link href={`/profile/${encodeURIComponent(user.id)}`} className="flex-1 text-sm font-semibold hover:underline" style={{ color: 'var(--text)' }}>{user.username}</Link>
                <GradBtn onClick={() => addUserDirectly(user.id)} className="px-3 py-1.5 text-xs">Add</GradBtn>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}