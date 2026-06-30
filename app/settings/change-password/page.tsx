'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess(false)

    if (newPassword !== confirmPassword) { setError("Passwords don't match"); return }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) { setError(error.message); setLoading(false); return }

    setSuccess(true)
    setNewPassword(''); setConfirmPassword('')
    setLoading(false)
  }

  const strength = newPassword.length < 3 ? 0 : newPassword.length < 6 ? 1 : newPassword.length < 9 ? 2 : 3
  const strengthLabel = ['Too short', 'Weak', 'Good', 'Strong'][strength]
  const strengthColor = ['#EF4444', '#F59E0B', '#6366F1', '#10B981'][strength]

  return (
    <div className="min-h-screen" style={{ background: '#F8F7FF' }}>
      <Navbar activePage="profile" />
      <main className="max-w-md mx-auto py-10 px-4">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1A1A2E' }}>Change Password</h1>
          <p className="text-sm mt-1" style={{ color: '#9CA3AF' }}>Update your account password</p>
        </div>

        <div className="rounded-2xl border p-6 shadow-sm" style={{ background: 'white', borderColor: '#F0EFF8' }}>
          <form onSubmit={handleChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>New Password</label>
              <input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>

            {newPassword && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-1 flex-1 rounded-full transition-all" style={{ background: i <= strength ? strengthColor : '#E5E7EB' }} />
                  ))}
                </div>
                <p className="text-xs" style={{ color: strengthColor }}>{strengthLabel} password</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Confirm New Password</label>
              <input type="password" required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFA' }} />
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}
            {success && <div className="bg-green-50 border border-green-100 text-green-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">✅ Password updated successfully!</div>}

            <button type="submit" disabled={loading}
              className="w-full text-white font-semibold py-3.5 rounded-xl text-sm transition disabled:opacity-50 shadow-md hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #6366F1, #EC4899)' }}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        <a href="/profile" className="block text-center text-sm font-medium mt-5 hover:underline" style={{ color: '#6366F1' }}>← Back to Profile</a>
      </main>
    </div>
  )
}