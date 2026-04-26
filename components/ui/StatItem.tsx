interface StatItemProps {
  value: React.ReactNode
  label: string
  showDivider?: boolean
}

export default function StatItem({ value, label, showDivider }: StatItemProps) {
  return (
    <>
      {showDivider && (
        <div className="divider-vert" style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />
      )}
      <div style={{ textAlign: 'center', padding: '0 28px' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 34,
            fontWeight: 400,
            color: 'var(--text-1)',
            lineHeight: 0.95,
            letterSpacing: '-0.04em',
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-3)',
            marginTop: 8,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
      </div>
    </>
  )
}
