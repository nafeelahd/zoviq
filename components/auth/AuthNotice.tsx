import type { ReactNode } from 'react'

export default function AuthNotice({ children, type = 'error' }: { children: ReactNode; type?: 'error' | 'success' }) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`auth-notice ${type}`}
    >
      <span aria-hidden="true">{type === 'error' ? '!' : '✓'}</span>
      <p>{children}</p>
    </div>
  )
}
