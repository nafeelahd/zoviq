import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginRequest, readJsonBody } from '@/lib/security'
import { checkRateLimit } from '@/lib/serverRateLimit'

type CallNotificationRequest = {
  roomName?: unknown
  recipientId?: unknown
  callType?: unknown
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 })
  }

  const payload = await readJsonBody<CallNotificationRequest>(request, 2048)
  if (!payload) return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  const { roomName, recipientId, callType } = payload
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (
    typeof roomName !== 'string' ||
    roomName.length > 80 ||
    typeof recipientId !== 'string' ||
    !uuidPattern.test(recipientId) ||
    (callType !== 'audio' && callType !== 'video')
  ) {
    return NextResponse.json({ error: 'Invalid call notification details' }, { status: 400 })
  }

  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) {
    return NextResponse.json({ error: 'You must be signed in to start a call' }, { status: 401 })
  }

  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 })
  }
  if (recipientId.toLowerCase() === user.id.toLowerCase()) {
    return NextResponse.json({ error: 'You cannot call yourself' }, { status: 400 })
  }
  const rateLimit = await checkRateLimit(user.id, 'call-notify', 5, 60)
  if (rateLimit !== 'allowed') {
    return NextResponse.json(
      { error: rateLimit === 'limited' ? 'Too many call notifications. Try again shortly.' : 'Call security checks are unavailable' },
      { status: rateLimit === 'limited' ? 429 : 503, headers: rateLimit === 'limited' ? { 'Retry-After': '60' } : undefined }
    )
  }

  const expectedRoom = `dm-${[user.id, recipientId].sort().join('-')}`
  if (roomName.trim().toLowerCase() !== expectedRoom) {
    return NextResponse.json({ error: 'You are not allowed to notify this person about the call' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('Could not create call notification: SUPABASE_SERVICE_ROLE_KEY is not configured')
    return NextResponse.json({
      error: 'Call notifications are not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY and redeploy.',
    }, { status: 503 })
  }

  const admin = createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: recipient, error: recipientError } = await admin.auth.admin.getUserById(recipientId)
  if (recipientError) {
    console.error('Could not verify call recipient:', recipientError)
    return NextResponse.json({ error: 'Could not verify the call recipient' }, { status: 500 })
  }
  if (!recipient.user) {
    return NextResponse.json({ error: 'Call recipient was not found' }, { status: 404 })
  }

  const { error } = await admin.from('notifications').insert({
    user_id: recipientId,
    actor_id: user.id,
    type: callType === 'video' ? 'video_call' : 'audio_call',
    call_room: expectedRoom,
    read: false,
  })

  if (error) {
    console.error('Could not create call notification:', error)
    return NextResponse.json({ error: 'Could not create the call notification' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
