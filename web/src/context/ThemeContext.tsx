import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'contentCMS.theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') {
    return null
  }
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isTheme(stored) ? stored : null
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = readStoredTheme()
    const resolved = stored ?? getSystemTheme()
    applyTheme(resolved)
    return resolved
  })
  const [isSystemPreferred, setIsSystemPreferred] = useState(() => readStoredTheme() === null)

  useEffect(() => {
    applyTheme(theme)
    if (typeof window === 'undefined') {
      return
    }
    if (isSystemPreferred) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, theme)
    }
  }, [theme, isSystemPreferred])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => {
      if (isSystemPreferred) {
        setThemeState(event.matches ? 'dark' : 'light')
      }
    }
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [isSystemPreferred])

  const setTheme = (next: Theme) => {
    setIsSystemPreferred(false)
    setThemeState(next)
  }

  const toggleTheme = () => {
    setIsSystemPreferred(false)
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
