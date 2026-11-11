import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginRequest, readJsonBody } from '@/lib/security'
import { checkRateLimit } from '@/lib/serverRateLimit'

type DailyRoom = {
  url?: string
  privacy?: string
  error?: string
  info?: string
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed' }, { status: 403 })
  }

  const payload = await readJsonBody<{ roomName?: unknown }>(request, 1024)
  const { roomName } = payload || {}
  if (typeof roomName !== 'string' || !roomName.trim()) {
    return NextResponse.json({ error: 'A room name is required' }, { status: 400 })
  }
  if (roomName.length > 80) {
    return NextResponse.json({ error: 'Room name is too long' }, { status: 400 })
  }

  const supabase = createClient()
  const authorization = request.headers.get('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'You must be signed in to join a call' }, { status: 401 })
  }
  const rateLimit = await checkRateLimit(user.id, 'call-room', 10, 60)
  if (rateLimit !== 'allowed') {
    return NextResponse.json(
      { error: rateLimit === 'limited' ? 'Too many call requests. Try again shortly.' : 'Call security checks are unavailable' },
      { status: rateLimit === 'limited' ? 429 : 503, headers: rateLimit === 'limited' ? { 'Retry-After': '60' } : undefined }
    )
  }

  const requestedRoom = roomName.trim().toLowerCase()
  let authorized = false
  const groupMatch = requestedRoom.match(/^group-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  const directMatch = requestedRoom.match(/^dm-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
  if (groupMatch) {
    const groupId = groupMatch[1]
    const { data: membership, error } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) {
      console.error('Could not verify group call membership:', error)
      return NextResponse.json({ error: 'Could not verify group membership' }, { status: 500 })
    }
    authorized = Boolean(membership)
  } else if (directMatch) {
    const participantIds = [directMatch[1], directMatch[2]]
    authorized = participantIds[0] !== participantIds[1]
      && participantIds.includes(user.id.toLowerCase())
      && requestedRoom === `dm-${participantIds.sort().join('-')}`
  }

  if (!authorized) {
    return NextResponse.json({ error: 'You are not allowed to join this call' }, { status: 403 })
  }

  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Daily API key is not configured. Add DAILY_API_KEY to your deployment environment and redeploy.',
    }, { status: 500 })
  }

  const sanitized = requestedRoom

  const headers = { Authorization: `Bearer ${apiKey}` }

  try {
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${sanitized}`, { headers })
    let room: DailyRoom

    if (getRes.ok) {
      room = await getRes.json() as DailyRoom
    } else if (getRes.status === 404) {
      const createRes = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sanitized,
          privacy: 'private',
          properties: {
            exp: Math.floor(Date.now() / 1000) + 7200,
            max_participants: 10,
            enable_screenshare: true,
            enable_chat: false,
            start_video_off: false,
            start_audio_off: false,
            enable_knocking: false,
          },
        }),
      })

      room = await createRes.json().catch(() => ({})) as DailyRoom
      if (!createRes.ok) {
        return NextResponse.json(
          { error: room.info || room.error || `Daily could not create the room (HTTP ${createRes.status})` },
          { status: 502 }
        )
      }
    } else {
      const error = await getRes.json().catch(() => ({})) as DailyRoom
      return NextResponse.json(
        { error: error.info || error.error || `Daily could not check the room (HTTP ${getRes.status})` },
        { status: 502 }
      )
    }

    if (!room.url) {
      return NextResponse.json({ error: 'Daily returned a room without a URL' }, { status: 502 })
    }

    if (room.privacy !== 'private') {
      const updateRes = await fetch(`https://api.daily.co/v1/rooms/${sanitized}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacy: 'private' }),
      })
      if (!updateRes.ok) {
        const error = await updateRes.json().catch(() => ({})) as DailyRoom
        return NextResponse.json(
          { error: error.info || error.error || `Daily could not secure the room (HTTP ${updateRes.status})` },
          { status: 502 }
        )
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) {
      console.error('Could not load call participant profile:', profileError)
      return NextResponse.json({ error: 'Could not load your call profile' }, { status: 500 })
    }

    const tokenRes = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          room_name: sanitized,
          user_name: profile?.username || 'Participant',
          exp: Math.floor(Date.now() / 1000) + 7200,
        },
      }),
    })
    const tokenData = await tokenRes.json().catch(() => ({})) as { token?: string; error?: string; info?: string }
    if (!tokenRes.ok || !tokenData.token) {
      return NextResponse.json(
        { error: tokenData.info || tokenData.error || `Daily could not authorize this call (HTTP ${tokenRes.status})` },
        { status: 502 }
      )
    }

    return NextResponse.json({ url: room.url, roomName: sanitized, token: tokenData.token })
  } catch (error) {
    console.error('Daily room request failed:', error)
    return NextResponse.json({ error: 'Could not reach Daily. Please try again.' }, { status: 502 })
  }
}
