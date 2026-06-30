'use client'

import { useEffect, useState } from 'react'

export function useTheme() {
  const [darkMode, setDarkModeState] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('darkMode')
    const isDark = saved === 'true'
    setDarkModeState(isDark)
    document.documentElement.classList.toggle('dark', isDark)

    // Listen for changes from other tabs/components
    const handleStorage = () => {
      const val = localStorage.getItem('darkMode') === 'true'
      setDarkModeState(val)
      document.documentElement.classList.toggle('dark', val)
    }
    window.addEventListener('storage', handleStorage)
    window.addEventListener('darkModeChange', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('darkModeChange', handleStorage)
    }
  }, [])

  const setDarkMode = (value: boolean) => {
    setDarkModeState(value)
    localStorage.setItem('darkMode', String(value))
    document.documentElement.classList.toggle('dark', value)
    window.dispatchEvent(new Event('darkModeChange'))
  }

  return { darkMode, setDarkMode }
}

// Theme colors that work with the dark class
export const theme = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  sub: 'var(--sub)',
  muted: 'var(--muted)',
}