interface PricingCardProps {
  title: string
  price: React.ReactNode
  period?: string
  description: string
  features: string[]
  ctaLabel: string
  ctaHref: string
  variant: 'default' | 'featured' | 'dark'
  ctaSecondary?: string
}

const CheckIcon = ({ stroke = 'var(--text-3)' }: { stroke?: string }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" style={{ flexShrink: 0, marginTop: 2 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default function PricingCard({
  title,
  price,
  period,
  description,
  features,
  ctaLabel,
  ctaHref,
  variant,
  ctaSecondary,
}: PricingCardProps) {
  const isFeatured = variant === 'featured'
  const isDark = variant === 'dark'

  const textMuted = isDark ? 'var(--panel-muted)' : 'var(--text-3)'
  const textSecondary = isDark ? 'var(--panel-muted)' : 'var(--text-2)'
  const textPrimary = isDark ? 'var(--panel-text)' : 'var(--text-1)'
  const borderColor = isDark ? 'var(--panel-border)' : isFeatured ? 'var(--accent-border)' : 'var(--border)'
  const background = isDark
    ? 'rgba(20,20,18,0.92)'
    : isFeatured
      ? 'linear-gradient(180deg, rgba(31,111,235,0.05), rgba(255,255,255,0.82))'
      : 'rgba(255,255,255,0.76)'

  return (
    <div
      className="pricing-card"
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: '24px',
        padding: 28,
        background,
        boxShadow: isDark ? 'none' : '0 16px 40px rgba(15,23,42,0.05)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(10px)',
        transition: 'transform var(--transition-base), box-shadow var(--transition-base)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: isFeatured ? 'var(--accent)' : textMuted,
              padding: '5px 10px',
              borderRadius: 9999,
              border: `1px solid ${isFeatured ? 'var(--accent-border)' : borderColor}`,
              background: isFeatured ? 'var(--accent-subtle)' : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)',
            }}
          >
            {title}
          </span>
          {isFeatured && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>Most popular</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 46, fontWeight: 400, color: textPrimary, lineHeight: 0.95, letterSpacing: '-0.04em' }}>
            {price}
          </div>
          {period && <div style={{ fontSize: 14, color: textMuted, paddingBottom: 6 }}>{period}</div>}
        </div>

        <div style={{ fontSize: 15, lineHeight: 1.8, color: textSecondary, marginTop: 12 }}>
          {description}
        </div>
      </div>

      <div style={{ height: 1, background: borderColor, opacity: 0.8, marginBottom: 22 }} />

      <ul style={{ listStyle: 'none', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28, padding: 0 }}>
        {features.map((item) => (
          <li key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.6, color: textSecondary }}>
            <CheckIcon stroke={isFeatured ? 'var(--accent)' : textMuted} />
            {item}
          </li>
        ))}
      </ul>

      <a
        href={ctaHref}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '12px 16px',
          background: isFeatured ? 'var(--text-1)' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.82)',
          border: `1px solid ${isFeatured ? 'var(--text-1)' : borderColor}`,
          borderRadius: '12px',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 600,
          color: isFeatured ? 'var(--text-inv)' : textPrimary,
          textDecoration: 'none',
          transition: 'transform var(--transition-fast), background var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.02)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        {ctaLabel}
      </a>

      {ctaSecondary && (
        <div style={{ textAlign: 'center', fontSize: 12, color: textMuted, marginTop: 10 }}>
          {ctaSecondary}
        </div>
      )}
    </div>
  )
}
