'use client'

import { useState } from 'react'

interface ShareModalProps {
  url: string
  title: string
  type: 'post' | 'profile' | 'story'
  onClose: () => void
}

export default function ShareModal({ url, title, type, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)

  const shareUrl = `${window.location.origin}${url}`

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareOptions = [
    {
      name: 'Copy Link',
      icon: copied ? '✅' : '🔗',
      action: copyLink,
      color: '#EEF2FF',
      textColor: '#6366F1',
    },
    {
      name: 'WhatsApp',
      icon: '💬',
      action: () => window.open(`https://wa.me/?text=${encodeURIComponent(title + ' ' + shareUrl)}`, '_blank'),
      color: '#F0FDF4',
      textColor: '#16A34A',
    },
    {
      name: 'Twitter / X',
      icon: '𝕏',
      action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(shareUrl)}`, '_blank'),
      color: '#F8F7FF',
      textColor: '#1A1A2E',
    },
    {
      name: 'Facebook',
      icon: '📘',
      action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'),
      color: '#EFF6FF',
      textColor: '#1D4ED8',
    },
    {
      name: 'Telegram',
      icon: '✈️',
      action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`, '_blank'),
      color: '#EFF6FF',
      textColor: '#0369A1',
    },
    {
      name: 'Native Share',
      icon: '📤',
      action: async () => {
        if (navigator.share) {
          await navigator.share({ title, url: shareUrl })
        } else {
          copyLink()
        }
      },
      color: '#FDF2F8',
      textColor: '#EC4899',
    },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center p-4 sm:items-center" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#F0EFF8' }}>
          <div>
            <h3 className="font-bold text-base" style={{ color: '#1A1A2E' }}>Share {type}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>Choose how to share</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition text-gray-400 text-xl">×</button>
        </div>

        {/* Link preview */}
        <div className="mx-5 my-4 flex items-center gap-3 p-3 rounded-xl border" style={{ background: '#F8F7FF', borderColor: '#F0EFF8' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
            <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
              <polygon points="22,20 78,20 78,38 44,62 78,62 78,80 22,80 22,62 56,38 22,38" fill="white"/>
            </svg>
          </div>
          <p className="text-xs flex-1 truncate" style={{ color: '#6B7280' }}>{shareUrl}</p>
        </div>

        {/* Share options grid */}
        <div className="grid grid-cols-3 gap-3 px-5 pb-5">
          {shareOptions.map(opt => (
            <button key={opt.name} onClick={opt.action}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl transition hover:scale-105 active:scale-95"
              style={{ background: opt.color }}>
              <span className="text-2xl">{opt.icon}</span>
              <span className="text-xs font-medium" style={{ color: opt.textColor }}>{opt.name}</span>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div className="px-5 pb-5">
          <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-semibold border transition hover:bg-gray-50"
            style={{ color: '#6B7280', borderColor: '#E5E7EB' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}