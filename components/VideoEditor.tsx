'use client'

import { useState, useRef, useEffect } from 'react'

interface VideoEditorProps {
  file: File
  onDone: (trimmedFile: File, startTime: number, endTime: number) => void
  onCancel: () => void
}

export default function VideoEditor({ file, onDone, onCancel }: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const previewUrl = useRef(URL.createObjectURL(file))

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl.current)
  }, [])

  const handleLoaded = () => {
    const d = videoRef.current?.duration || 0
    setDuration(d)
    setEndTime(d)
  }

  const handleTimeUpdate = () => {
    const t = videoRef.current?.currentTime || 0
    setCurrentTime(t)
    if (t >= endTime) {
      videoRef.current!.pause()
      videoRef.current!.currentTime = startTime
      setPlaying(false)
    }
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
      setPlaying(false)
    } else {
      videoRef.current.currentTime = startTime
      videoRef.current.play()
      setPlaying(true)
    }
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleDone = () => {
    // Pass the original file with trim points
    // Actual trimming happens server-side or on upload
    onDone(file, startTime, endTime)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Trim Video</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Video preview */}
        <div className="bg-black">
          <video
            ref={videoRef}
            src={previewUrl.current}
            className="w-full max-h-64 object-contain"
            onLoadedMetadata={handleLoaded}
            onTimeUpdate={handleTimeUpdate}
            playsInline
          />
        </div>

        <div className="p-5 space-y-5">
          {/* Play button & time */}
          <div className="flex items-center justify-between">
            <button
              onClick={togglePlay}
              className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white hover:bg-purple-700 transition"
            >
              {playing ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <span className="text-sm text-gray-500">{fmt(currentTime)} / {fmt(duration)}</span>
          </div>

          {/* Start time slider */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Start: {fmt(startTime)}</span>
              <span>Drag to set start point</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={startTime}
              onChange={e => {
                const v = parseFloat(e.target.value)
                if (v < endTime) {
                  setStartTime(v)
                  if (videoRef.current) videoRef.current.currentTime = v
                }
              }}
              className="w-full accent-purple-600"
            />
          </div>

          {/* End time slider */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>End: {fmt(endTime)}</span>
              <span>Drag to set end point</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={endTime}
              onChange={e => {
                const v = parseFloat(e.target.value)
                if (v > startTime) {
                  setEndTime(v)
                  if (videoRef.current) videoRef.current.currentTime = v
                }
              }}
              className="w-full accent-purple-600"
            />
          </div>

          {/* Trim info */}
          <div className="bg-purple-50 rounded-xl px-4 py-3 text-sm text-purple-700">
            Trimmed clip: <strong>{fmt(endTime - startTime)}</strong> ({fmt(startTime)} → {fmt(endTime)})
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >Cancel</button>
            <button
              onClick={handleDone}
              className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-purple-700 transition"
            >Use this clip</button>
          </div>
        </div>
      </div>
    </div>
  )
}