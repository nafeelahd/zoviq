import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { roomName } = await request.json()
  const apiKey = process.env.NEXT_PUBLIC_DAILY_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Daily API key not configured' }, { status: 500 })
  }

  // Sanitize room name — Daily only allows alphanumeric and hyphens
  const sanitizedName = roomName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()

  try {
    // First try to get existing room
    const getResponse = await fetch(`https://api.daily.co/v1/rooms/${sanitizedName}`, {
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
        name: sanitizedName,
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
          enable_screenshare: true,
          enable_chat: false,
          start_video_off: false,
          start_audio_off: false,
          lang: 'en',
        },
      }),
    })

    const room = await response.json()
    if (!room.url) {
      console.error('Daily room creation failed:', room)
      return NextResponse.json({ error: room.error || 'Failed to create room' }, { status: 500 })
    }
    return NextResponse.json({ url: room.url })
  } catch (error: any) {
    console.error('Call API error:', error)
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 })
  }
}