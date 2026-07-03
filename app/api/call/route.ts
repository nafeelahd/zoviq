import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { roomName } = await request.json()
  const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Daily API key not configured' }, { status: 500 })
  }

  // Sanitize - Daily only allows lowercase alphanumeric and hyphens, max 40 chars
  const sanitized = roomName
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .toLowerCase()
    .slice(0, 40)

  try {
    // Always try to get existing room first
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${sanitized}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (getRes.ok) {
      const room = await getRes.json()
      console.log('Using existing room:', room.url)
      return NextResponse.json({ url: room.url, roomName: sanitized })
    }

    // Create room with 2 hour expiry
    const createRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
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

    const room = await createRes.json()
    console.log('Created room:', room)

    if (!room.url) {
      return NextResponse.json({ error: room.error || 'Room creation failed' }, { status: 500 })
    }

    return NextResponse.json({ url: room.url, roomName: sanitized })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}