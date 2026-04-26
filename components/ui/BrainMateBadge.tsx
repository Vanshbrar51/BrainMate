import type { CSSProperties, ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export default function Badge({ children, className = '', style }: BadgeProps) {
  return (
    <div
      className={className}
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.78)',
        padding: '6px 12px',
        borderRadius: 9999,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {children}
    </div>
  )
}
