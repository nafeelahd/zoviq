'use client'

interface IncomingCallProps {
  callerName: string
  callType: 'video' | 'audio'
  onAccept: () => void
  onDecline: () => void
}

export default function IncomingCall({ callerName, callType, onAccept, onDecline }: IncomingCallProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
        {/* Pulsing avatar */}
        <div className="relative w-24 h-24 mx-auto mb-5">
          <div className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{background: 'linear-gradient(135deg, #6366F1, #EC4899)'}}/>
          <div className="relative w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold"
            style={{background: 'linear-gradient(135deg, #6366F1, #EC4899)'}}>
            {callerName[0]?.toUpperCase()}
          </div>
        </div>

        <p className="text-gray-400 text-sm mb-1">Incoming {callType === 'video' ? 'Video' : 'Audio'} Call</p>
        <h2 className="text-2xl font-bold text-gray-900 mb-8">{callerName}</h2>

        <div className="flex items-center justify-center gap-8">
          {/* Decline */}
          <div className="text-center">
            <button onClick={onDecline}
              className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center mx-auto transition shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/>
              </svg>
            </button>
            <p className="text-xs text-gray-400 mt-2">Decline</p>
          </div>

          {/* Accept */}
          <div className="text-center">
            <button onClick={onAccept}
              className="w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center mx-auto transition shadow-lg">
              {callType === 'video' ? (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              ) : (
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              )}
            </button>
            <p className="text-xs text-gray-400 mt-2">Accept</p>
          </div>
        </div>
      </div>
    </div>
  )
}