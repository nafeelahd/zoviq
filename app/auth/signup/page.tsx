'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AuthShell from '@/components/auth/AuthShell'
import AuthNotice from '@/components/auth/AuthNotice'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username }, emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
      if (data.session) {
        window.location.href = '/feed'
        return
      }
      setSuccess(true)
    } catch (error) {
      console.error('Could not create account:', error)
      setError(error instanceof Error ? error.message : 'Could not create account')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: verificationCode.trim(),
        type: 'signup',
      })
      if (error) throw error
      window.location.href = '/feed'
    } catch (error) {
      console.error('Could not verify signup code:', error)
      setError(error instanceof Error ? error.message : 'Could not verify the code')
    } finally {
      setLoading(false)
    }
  }

  const resendCode = async () => {
    setResending(true)
    setError('')
    setNotice('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
      if (error) throw error
      setNotice('A new verification email has been requested. Check your inbox and spam folder.')
    } catch (error) {
      console.error('Could not resend signup code:', error)
      setError(error instanceof Error ? error.message : 'Could not resend the verification email')
    } finally {
      setResending(false)
    }
  }

  if (success) return (
    <AuthShell>
      <div className="auth-card rounded-3xl p-8 text-center max-w-sm w-full">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Verify your email</h2>
        <p className="text-gray-500 text-sm mb-5">
          Enter the verification code sent to <strong>{email}</strong>. You can also use the confirmation link in the email.
        </p>
        <form onSubmit={handleVerify} className="space-y-4">
          <label htmlFor="verification-code" className="sr-only">Verification code</label>
          <input
            id="verification-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            required
            value={verificationCode}
            onChange={e => setVerificationCode(e.target.value.replace(/\s/g, ''))}
            placeholder="Enter code"
            className="w-full px-4 py-3 rounded-xl border text-center text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-indigo-400"
            style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }}
          />
          {error && <AuthNotice>{error}</AuthNotice>}
          {notice && <AuthNotice type="success">{notice}</AuthNotice>}
          <button type="submit" disabled={loading || !verificationCode.trim()}
            className="w-full text-white font-semibold py-3.5 rounded-xl text-sm transition disabled:opacity-50 shadow-md"
            style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
            {loading ? 'Verifying...' : 'Verify email →'}
          </button>
        </form>
        <button type="button" onClick={resendCode} disabled={resending}
          className="mt-4 text-sm font-semibold hover:underline disabled:opacity-50" style={{ color: '#6366F1' }}>
          {resending ? 'Sending...' : 'Resend code'}
        </button>
        <p className="text-gray-500 text-xs mt-4">
          If no email arrives, check spam. Email delivery may require custom SMTP in your Supabase project.
        </p>
      </div>
    </AuthShell>
  )

  return (
    <AuthShell>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
            <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
              <polygon points="22,20 78,20 78,38 44,62 78,62 78,80 22,80 22,62 56,38 22,38" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-1" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zoviq</h1>
          <p className="text-sm" style={{ color: '#6B7280' }}>Join the community today 🚀</p>
        </div>

        <div className="auth-card rounded-3xl p-8">
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Username</label>
              <input type="text" required value={username} onChange={e => setUsername(e.target.value)}
                placeholder="yourname"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Password</label>
              <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>

            {error && <AuthNotice>{error}</AuthNotice>}

            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3.5 rounded-xl text-sm transition disabled:opacity-50 shadow-md hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
              {loading ? 'Creating account...' : 'Create account →'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: '#6B7280' }}>
              Already have an account?{' '}
              <Link href="/auth/login" className="font-semibold hover:underline" style={{ color: '#6366F1' }}>Sign in</Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#9CA3AF' }}>Your world. Your moment. 🌟</p>
      </div>
    </AuthShell>
  )
}