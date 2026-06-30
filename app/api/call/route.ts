import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { roomName } = await request.json()
  const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Daily API key not configured' }, { status: 500 })
  }

  try {
    // First try to get existing room
    const getResponse = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (getResponse.ok) {
      const room = await getResponse.json()
      return NextResponse.json({ url: room.url })
    }

    // Create new room
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600,
          enable_chat: false,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    })

    const room = await response.json()
    if (!room.url) return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    return NextResponse.json({ url: room.url })
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}