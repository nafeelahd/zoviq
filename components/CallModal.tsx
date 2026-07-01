'use client'

import { useEffect, useRef, useState } from 'react'

interface CallModalProps {
  roomUrl: string
  onLeave: () => void
  callType: 'video' | 'audio'
  callerName: string
}

export default function CallModal({ roomUrl, onLeave, callType, callerName }: CallModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(callType === 'audio')
  const frameRef = useRef<any>(null)

  useEffect(() => {
    let frame: any = null

    const init = async () => {
      try {
        const DailyIframe = (await import('@daily-co/daily-js')).default

        // Destroy previous instance if exists
        if (frameRef.current) {
          try { frameRef.current.destroy() } catch {}
          frameRef.current = null
        }

        if (!containerRef.current) return

        frame = DailyIframe.createFrame(containerRef.current, {
          showLeaveButton: false,
          showFullscreenButton: true,
          iframeStyle: {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '0',
          },
        })

        frameRef.current = frame

        frame.on('joined-meeting', () => setStatus('connected'))
        frame.on('left-meeting', () => { onLeave(); try { frame.destroy() } catch {} })
        frame.on('error', (e: any) => {
          console.error('Daily error:', e)
          setError(e?.errorMsg || 'Call connection failed')
          setStatus('error')
        })

        await frame.join({
          url: roomUrl,
          startVideoOff: callType === 'audio',
          startAudioOff: false,
        })
      } catch (e: any) {
        console.error('Call init error:', e)
        setError(e?.message || 'Failed to start call')
        setStatus('error')
      }
    }

    init()

    return () => {
      if (frameRef.current) {
        try { frameRef.current.destroy() } catch {}
        frameRef.current = null
      }
    }
  }, [roomUrl])

  const toggleMute = async () => {
    if (!frameRef.current) return
    try {
      await frameRef.current.setLocalAudio(muted)
      setMuted(!muted)
    } catch {}
  }

  const toggleVideo = async () => {
    if (!frameRef.current) return
    try {
      await frameRef.current.setLocalVideo(videoOff)
      setVideoOff(!videoOff)
    } catch {}
  }

  const leaveCall = async () => {
    if (frameRef.current) {
      try { await frameRef.current.leave() } catch {}
      try { frameRef.current.destroy() } catch {}
      frameRef.current = null
    }
    onLeave()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0F0F13' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: '#1A1A2E' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: status === 'connected' ? '#10B981' : status === 'error' ? '#EF4444' : '#F59E0B' }} />
          <div>
            <p className="text-white font-semibold text-sm">{callerName}</p>
            <p className="text-xs" style={{ color: '#9CA3AF' }}>
              {status === 'connecting' ? 'Connecting...' : status === 'connected' ? (callType === 'video' ? '📹 Video call' : '📞 Audio call') : 'Connection failed'}
            </p>
          </div>
        </div>
      </div>

      {/* Call frame */}
      <div className="flex-1 relative">
        {status === 'error' ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <p className="text-4xl mb-4">❌</p>
            <p className="text-white font-semibold mb-2">Call Failed</p>
            <p className="text-sm mb-6" style={{ color: '#9CA3AF' }}>{error}</p>
            <p className="text-xs mb-4" style={{ color: '#6B7280' }}>
              Make sure your Daily.co API key is set correctly in Vercel environment variables as NEXT_PUBLIC_DAILY_API_KEY
            </p>
            <button onClick={onLeave}
              className="px-6 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition">
              Close
            </button>
          </div>
        ) : (
          <>
            {status === 'connecting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-4"
                  style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
                  {callerName[0]?.toUpperCase()}
                </div>
                <p className="text-white font-semibold mb-2">{callerName}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-xs mt-3" style={{ color: '#9CA3AF' }}>Connecting to call...</p>
              </div>
            )}
            <div ref={containerRef} className="w-full h-full" />
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 py-6 flex-shrink-0" style={{ background: '#1A1A2E' }}>
        <button onClick={toggleMute}
          className="w-14 h-14 rounded-full flex items-center justify-center transition hover:scale-105"
          style={{ background: muted ? '#EF4444' : '#2D2D44' }}
          title={muted ? 'Unmute' : 'Mute'}>
          <span className="text-xl">{muted ? '🔇' : '🎙️'}</span>
        </button>

        {callType === 'video' && (
          <button onClick={toggleVideo}
            className="w-14 h-14 rounded-full flex items-center justify-center transition hover:scale-105"
            style={{ background: videoOff ? '#EF4444' : '#2D2D44' }}
            title={videoOff ? 'Turn on camera' : 'Turn off camera'}>
            <span className="text-xl">{videoOff ? '📷' : '📹'}</span>
          </button>
        )}

        <button onClick={leaveCall}
          className="w-16 h-16 rounded-full flex items-center justify-center transition hover:scale-105 shadow-lg"
          style={{ background: '#EF4444' }}
          title="End call">
          <span className="text-2xl">📵</span>
        </button>
      </div>
    </div>
  )
}