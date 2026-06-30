'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/feed'
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #EEF2FF 0%, #FDF2F8 50%, #F0FDF4 100%)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
              <polygon points="22,20 78,20 78,38 44,62 78,62 78,80 22,80 22,62 56,38 22,38" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-1" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zoviq</h1>
          <p className="text-sm" style={{ color: '#6B7280' }}>Welcome back! Sign in to continue</p>
        </div>

        <div className="rounded-3xl p-8 shadow-xl border" style={{ background: 'white', borderColor: '#F0EFF8' }}>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: '#374151' }}>Password</label>
                <a href="/auth/forgot-password" className="text-xs font-medium hover:underline" style={{ color: '#6366F1' }}>Forgot password?</a>
              </div>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3.5 rounded-xl text-sm transition disabled:opacity-50 shadow-md hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
              {loading ? 'Signing in...' : 'Sign in →'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="font-semibold hover:underline" style={{ color: '#6366F1' }}>Create one</Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#9CA3AF' }}>Your world. Your moment. 🌟</p>
      </div>
    </div>
  )
}