'use client'

import { useState, useRef, useEffect } from 'react'
import type { FFmpeg as FFmpegInstance } from '@ffmpeg/ffmpeg'

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
  const [muteAudio, setMuteAudio] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const ffmpegRef = useRef<FFmpegInstance | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => () => { void ffmpegRef.current?.terminate() }, [])

  const handleLoaded = () => {
    const d = videoRef.current?.duration || 0
    setDuration(d)
    setEndTime(d)
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    const t = video.currentTime
    setCurrentTime(t)
    if (t >= endTime) {
      video.pause()
      video.currentTime = startTime
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
      void videoRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleDone = async () => {
    if (!duration || endTime <= startTime || processing) return
    setProcessing(true)
    setProgress(0)
    setError('')

    try {
      const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ])
      const ffmpeg = ffmpegRef.current || new FFmpeg()
      ffmpegRef.current = ffmpeg
      ffmpeg.on('progress', ({ progress: ratio }) => {
        setProgress(Math.max(0, Math.min(100, Math.round(ratio * 100))))
      })

      if (!ffmpeg.loaded) {
        const baseUrl = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, 'application/wasm'),
        })
      }

      const inputName = `input.${file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'video'}`
      const outputName = 'trimmed.mp4'
      await ffmpeg.writeFile(inputName, await fetchFile(file))
      const result = await ffmpeg.exec([
        '-i', inputName,
        '-ss', startTime.toFixed(3),
        '-t', (endTime - startTime).toFixed(3),
        '-map', '0:v:0',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        ...(muteAudio ? ['-an'] : ['-map', '0:a?', '-c:a', 'aac']),
        '-movflags', '+faststart',
        outputName,
      ])
      if (result !== 0) throw new Error('FFmpeg could not trim this video format')

      const output = await ffmpeg.readFile(outputName)
      if (typeof output === 'string') throw new Error('FFmpeg returned an invalid video file')
      const outputBuffer = output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength
      ) as ArrayBuffer
      const trimmedFile = new File([outputBuffer], file.name.replace(/\.[^.]+$/, '') + '-trimmed.mp4', {
        type: 'video/mp4',
      })
      if (!trimmedFile.size) throw new Error('The trimmed video is empty')
      onDone(trimmedFile, startTime, endTime)
    } catch (trimError) {
      console.error('Video trimming failed:', trimError)
      setError(trimError instanceof Error ? trimError.message : 'Could not trim this video')
    } finally {
      setProcessing(false)
    }
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
            src={previewUrl}
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

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={muteAudio} onChange={e => setMuteAudio(e.target.checked)} />
            Mute video audio
          </label>

          {processing && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-purple-100">
                <div className="h-full rounded-full bg-purple-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-500">{progress ? `Trimming video… ${progress}%` : 'Loading video trimmer…'}</p>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={processing}
              className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >Cancel</button>
            <button
              onClick={() => void handleDone()}
              disabled={processing || !duration || endTime <= startTime}
              className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50"
            >{processing ? 'Trimming…' : 'Trim & use clip'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}