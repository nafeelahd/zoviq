'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type PostMediaProps = {
  src: string
  alt: string
  className?: string
  video?: boolean
  autoPlay?: boolean
}

export default function PostMedia({ src, alt, className = '', video = false, autoPlay = false }: PostMediaProps) {
  const [resolvedSrc, setResolvedSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    const privatePrefix = 'private-posts:'
    setResolvedSrc('')
    setFailed(false)

    if (!src.startsWith(privatePrefix)) {
      setResolvedSrc(src)
      return () => { active = false }
    }

    const path = src.slice(privatePrefix.length)
    createClient().storage.from('private-posts').createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data?.signedUrl) {
          setFailed(true)
          console.error('Could not load private profile media:', error)
          return
        }
        setResolvedSrc(data.signedUrl)
      })
      .catch(error => {
        if (!active) return
        setFailed(true)
        console.error('Could not load private profile media:', error)
      })

    return () => { active = false }
  }, [src])

  if (failed) {
    return <div className={`flex items-center justify-center bg-black/5 text-sm ${className}`} role="img" aria-label={`${alt} unavailable`}>Media unavailable</div>
  }
  if (!resolvedSrc) {
    return <div className={`animate-pulse bg-black/5 ${className}`} aria-label="Loading media" />
  }
  return video
    ? <video src={resolvedSrc} aria-label={alt} controls playsInline autoPlay={autoPlay} className={className} />
    : <img src={resolvedSrc} alt={alt} className={className} />
}
