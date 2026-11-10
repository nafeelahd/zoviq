'use client'

import { useEffect, useRef, useState } from 'react'

type CameraCaptureProps = {
  onCapture: (file: File) => void
  onClose: () => void
  allowVideo?: boolean
}

export default function CameraCapture({ onCapture, onClose, allowVideo = true }: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    let active = true
    let cameraStream: MediaStream | null = null

    const openCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access requires a supported browser and a secure connection (HTTPS).')
        return
      }

      try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        })
          cameraStream = videoStream
          let audioTracks: MediaStreamTrack[] = []
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            audioTracks = audioStream.getAudioTracks()
          } catch (audioError) {
            console.error('Could not access microphone for camera recording:', audioError)
            if (active) setError('Microphone access is unavailable. Recorded videos will be silent.')
          }

          const recordingStream = new MediaStream([...videoStream.getVideoTracks(), ...audioTracks])
          cameraStream = recordingStream
          if (active) setStream(recordingStream)
          else recordingStream.getTracks().forEach(track => track.stop())
        } catch (cameraError) {
        console.error('Could not access camera:', cameraError)
        setError(cameraError instanceof Error && cameraError.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
          : 'Could not open the camera. Check that it is connected and not being used by another app.')
      }
    }

    void openCamera()
    return () => {
      active = false
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
      cameraStream?.getTracks().forEach(track => track.stop())
    }
  }, [])

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('The camera is still starting. Try again in a moment.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) {
      setError('Could not capture a photo from the camera.')
      return
    }
    context.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) {
        setError('Could not create the captured photo.')
        return
      }
      onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  const toggleVideoRecording = () => {
    if (!stream) return
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('Video recording is not supported in this browser.')
      return
    }

    try {
      const supportedTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
      const mimeType = supportedTypes.find(type => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => setError('Video recording failed. Please try again.')
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        if (!blob.size) {
          setError('No video was captured. Please try again.')
          return
        }
        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
        onCapture(new File([blob], `camera-${Date.now()}.${extension}`, { type: blob.type || 'video/webm' }))
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setError('')
      recorder.addEventListener('stop', () => setRecording(false), { once: true })
    } catch (recordingError) {
      console.error('Could not start camera recording:', recordingError)
      setError('Could not start video recording in this browser.')
    }
  }

  const close = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-gray-950 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 text-white">
          <h2 className="font-semibold">Camera</h2>
          <button type="button" onClick={close} className="rounded-lg px-3 py-1 text-2xl" aria-label="Close camera">×</button>
        </div>
        <div className="relative flex aspect-[3/4] max-h-[65vh] items-center justify-center bg-black">
          {stream
            ? <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" aria-label="Camera preview" />
            : <p className="max-w-xs px-6 text-center text-sm text-white">{error || 'Requesting camera permission…'}</p>
          }
          {recording && <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Recording</span>}
        </div>
        {error && stream && <p role="alert" className="px-4 pt-3 text-sm text-red-300">{error}</p>}
        <div className="flex items-center justify-center gap-4 px-4 py-4">
          <button type="button" onClick={capturePhoto} disabled={!stream || recording}
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 disabled:opacity-40">
            Take photo
          </button>
          {allowVideo && (
            <button type="button" onClick={toggleVideoRecording} disabled={!stream}
              className={`rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 ${recording ? 'bg-red-600' : 'bg-indigo-600'}`}>
              {recording ? 'Stop & use video' : 'Record video'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
