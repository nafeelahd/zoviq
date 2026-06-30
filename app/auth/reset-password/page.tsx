'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase sets the session from the URL hash automatically
    const supabase = createClient()
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, [])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords don't match"); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true); setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true); setLoading(false)
  }

  if (success) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 50%, #F0FDF4 100%)' }}>
      <div className="bg-white rounded-3xl p-10 text-center shadow-xl max-w-sm w-full">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Password updated!</h2>
        <p className="text-gray-500 text-sm mb-6">Your password has been successfully changed.</p>
        <button onClick={() => window.location.href = '/auth/login'}
          className="w-full text-white font-semibold py-3 rounded-xl text-sm"
          style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
          Sign in now →
        </button>
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
          <p className="text-sm" style={{ color: '#6B7280' }}>Set a new password</p>
        </div>

        <div className="rounded-3xl p-8 shadow-xl border" style={{ background: 'white', borderColor: '#F0EFF8' }}>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">New password</h2>
            <p className="text-sm text-gray-500">Choose a strong password for your account.</p>
          </div>

          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>New password</label>
              <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Confirm password</label>
              <input type="password" required minLength={6} value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>

            {/* Password strength */}
            {password && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-1 flex-1 rounded-full transition-all" style={{
                      background: password.length >= i * 3
                        ? i <= 1 ? '#EF4444' : i <= 2 ? '#F59E0B' : i <= 3 ? '#6366F1' : '#10B981'
                        : '#E5E7EB'
                    }}/>
                  ))}
                </div>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>
                  {password.length < 3 ? 'Too short' : password.length < 6 ? 'Weak' : password.length < 9 ? 'Good' : 'Strong'} password
                </p>
              </div>
            )}

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3.5 rounded-xl text-sm transition disabled:opacity-50 shadow-md"
              style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
              {loading ? 'Updating...' : 'Update password →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}