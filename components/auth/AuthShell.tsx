import type { ReactNode } from 'react'

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page relative min-h-screen overflow-hidden flex items-center justify-center p-4">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <div className="relative z-10 w-full flex justify-center py-8">{children}</div>
    </main>
  )
}
