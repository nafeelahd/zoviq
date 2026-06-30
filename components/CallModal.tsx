'use client'

import { useEffect, useRef, useState } from 'react'

interface CallModalProps {
  roomUrl: string
  onLeave: () => void
  callType: 'video' | 'audio'
  callerName: string
}

export default function CallModal({ roomUrl, onLeave, callType, callerName }: CallModalProps) {
  const callRef = useRef<HTMLDivElement>(null)
  const [callFrame, setCallFrame] = useState<any>(null)
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(callType === 'audio')
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!callRef.current) return

    const initCall = async () => {
      try {
        const DailyIframe = (await import('@daily-co/daily-js')).default
        const frame = DailyIframe.createFrame(callRef.current!, {
          showLeaveButton: false,
          showFullscreenButton: false,
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '16px',
          },
        })

        frame.on('joined-meeting', () => setJoined(true))
        frame.on('left-meeting', () => { onLeave(); frame.destroy() })
        frame.on('error', (e: any) => setError(e.errorMsg || 'Call error'))

        await frame.join({ url: roomUrl, startVideoOff: callType === 'audio' })
        setCallFrame(frame)
      } catch (e: any) {
        setError(e.message || 'Failed to start call')
      }
    }

    initCall()
    return () => { callFrame?.destroy() }
  }, [roomUrl])

  const toggleMute = async () => {
    if (!callFrame) return
    await callFrame.setLocalAudio(muted)
    setMuted(!muted)
  }

  const toggleVideo = async () => {
    if (!callFrame) return
    await callFrame.setLocalVideo(videoOff)
    setVideoOff(!videoOff)
  }

  const leaveCall = async () => {
    await callFrame?.leave()
    onLeave()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
            <p className="text-white font-medium text-sm">
              {callType === 'video' ? '📹' : '📞'} {callerName}
            </p>
          </div>
          {!joined && !error && (
            <p className="text-gray-400 text-xs">Connecting...</p>
          )}
        </div>

        {/* Call frame */}
        <div ref={callRef} className="w-full bg-gray-900 rounded-2xl overflow-hidden"
          style={{ height: callType === 'video' ? '60vh' : '200px' }}>
          {error && (
            <div className="flex items-center justify-center h-full text-center p-8">
              <div>
                <p className="text-4xl mb-3">❌</p>
                <p className="text-white text-sm">{error}</p>
                <button onClick={onLeave} className="mt-4 text-sm text-white bg-red-500 px-4 py-2 rounded-xl">Close</button>
              </div>
            </div>
          )}
          {!error && callType === 'audio' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white mx-auto mb-3"
                  style={{background: 'linear-gradient(135deg, #6366F1, #EC4899)'}}>
                  {callerName[0]?.toUpperCase()}
                </div>
                <p className="text-white font-medium">{callerName}</p>
                <p className="text-gray-400 text-sm mt-1">{joined ? 'Connected' : 'Calling...'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mt-5">
          {/* Mute */}
          <button onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition ${muted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
            {muted ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
              </svg>
            )}
          </button>

          {/* Video toggle — only for video calls */}
          {callType === 'video' && (
            <button onClick={toggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition ${videoOff ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
              </svg>
            </button>
          )}

          {/* End call */}
          <button onClick={leaveCall}
            className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}