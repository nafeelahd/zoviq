import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

type CallNotificationRequest = {
  roomName?: unknown
  recipientId?: unknown
  callType?: unknown
}

export async function POST(request: NextRequest) {
  let payload: CallNotificationRequest
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  const { roomName, recipientId, callType } = payload
  if (
    typeof roomName !== 'string' ||
    typeof recipientId !== 'string' ||
    !recipientId ||
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
  const { error } = await admin.from('notifications').insert({
    user_id: recipientId,
    actor_id: user.id,
    type: callType === 'video' ? 'video_call' : 'audio_call',
    call_room: expectedRoom,
    read: false,
  })

  if (error) {
    console.error('Could not create call notification:', error)
    return NextResponse.json({
      error: `Could not create the call notification: ${error.message}`,
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
