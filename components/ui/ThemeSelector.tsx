'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { Sun, Monitor, Moon } from 'lucide-react'

const OPTIONS = [
  { value: 'light', Icon: Sun, label: 'Light' },
  { value: 'system', Icon: Monitor, label: 'System' },
  { value: 'dark', Icon: Moon, label: 'Dark' },
] as const

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  if (!mounted) return null

  return (
    <div
      role="group"
      aria-label="Theme selector"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '3px',
        borderRadius: '9999px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}
    >
      {OPTIONS.map(({ value, Icon, label }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={`Switch to ${label} theme`}
            aria-pressed={active}
            title={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              boxShadow: active ? 'var(--shadow-xs)' : 'none',
              transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease',
            }}
          >
            <Icon size={13} strokeWidth={active ? 2.2 : 1.8} />
          </button>
        )
      })}
    </div>
  )
}
