'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setSent(true); setLoading(false)
  }

  if (sent) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 50%, #F0FDF4 100%)' }}>
      <div className="bg-white rounded-3xl p-10 text-center shadow-xl max-w-sm w-full">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#EEF2FF' }}>
          <span className="text-3xl">📧</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email!</h2>
        <p className="text-gray-500 text-sm mb-6">We sent a password reset link to <strong>{email}</strong>. Click the link to reset your password.</p>
        <Link href="/auth/login" className="text-sm font-semibold hover:underline" style={{ color: '#6366F1' }}>Back to sign in</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 50%, #F0FDF4 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
              <polygon points="22,20 78,20 78,38 44,62 78,62 78,80 22,80 22,62 56,38 22,38" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-1" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zoviq</h1>
          <p className="text-sm" style={{ color: '#6B7280' }}>Reset your password</p>
        </div>

        <div className="rounded-3xl p-8 shadow-xl border" style={{ background: 'white', borderColor: '#F0EFF8' }}>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Forgot password?</h2>
            <p className="text-sm text-gray-500">No worries! Enter your email and we'll send you a reset link.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Email address</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3.5 rounded-xl text-sm transition disabled:opacity-50 shadow-md"
              style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
              {loading ? 'Sending...' : 'Send reset link →'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/auth/login" className="text-sm font-medium hover:underline flex items-center justify-center gap-1" style={{ color: '#6B7280' }}>
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}