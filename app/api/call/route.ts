import { NextRequest, NextResponse } from 'next/server'

type DailyRoom = {
  url?: string
  error?: string
  info?: string
}

export async function POST(request: NextRequest) {
  let roomName: unknown
  try {
    ({ roomName } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  if (typeof roomName !== 'string' || !roomName.trim()) {
    return NextResponse.json({ error: 'A room name is required' }, { status: 400 })
  }

  const apiKey = process.env.DAILY_API_KEY || process.env.NEXT_PUBLIC_DAILY_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Daily API key is not configured. Add DAILY_API_KEY to your deployment environment and redeploy.',
    }, { status: 500 })
  }

  const sanitized = roomName
    .trim()
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase()
    .slice(0, 40)

  if (!/[a-z0-9]/.test(sanitized)) {
    return NextResponse.json({ error: 'Room name must contain at least one letter or number' }, { status: 400 })
  }

  const headers = { Authorization: `Bearer ${apiKey}` }

  try {
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${sanitized}`, { headers })

    if (getRes.ok) {
      const room = await getRes.json() as DailyRoom
      if (room.url) return NextResponse.json({ url: room.url, roomName: sanitized })
      return NextResponse.json({ error: 'Daily returned a room without a URL' }, { status: 502 })
    }

    if (getRes.status !== 404) {
      const error = await getRes.json().catch(() => ({})) as DailyRoom
      return NextResponse.json(
        { error: error.info || error.error || `Daily could not check the room (HTTP ${getRes.status})` },
        { status: 502 }
      )
    }

    const createRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sanitized,
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

    const room = await createRes.json().catch(() => ({})) as DailyRoom
    if (!createRes.ok || !room.url) {
      return NextResponse.json(
        { error: room.info || room.error || `Daily could not create the room (HTTP ${createRes.status})` },
        { status: 502 }
      )
    }

    return NextResponse.json({ url: room.url, roomName: sanitized })
  } catch (error) {
    console.error('Daily room request failed:', error)
    return NextResponse.json({ error: 'Could not reach Daily. Please try again.' }, { status: 502 })
  }
}
