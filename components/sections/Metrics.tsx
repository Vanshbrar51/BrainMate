import { NumberTicker } from '@/components/magicui/number-ticker'

const metrics = [
  { value: 220000, suffix: '+', label: 'Active learners', decimals: 0 },
  { value: 4.8, suffix: '', label: 'Average rating', decimals: 1 },
  { value: 40, suffix: '+', label: 'Languages', decimals: 0 },
  { value: 3.2, suffix: '×', label: 'Faster to understand', decimals: 1 },
]

export default function Metrics() {
  return (
    <div style={{ padding: '0 0 var(--section-gap) 0' }}>
      <div className="container">
        <div style={{ textAlign: 'center', margin: '0 auto 64px', maxWidth: '480px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(24px, 3vw, 36px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.15,
              color: 'var(--panel-text)',
            }}
          >
            Trusted by learners in
            <br />
            <em>40+ countries.</em>
          </h2>
        </div>

        <div className="metrics-grid" style={{ maxWidth: '800px', margin: '0 auto' }}>
          {metrics.map((m, i) => (
            <div
              key={m.label}
              style={{
                padding: '48px 40px',
                borderRight: i < metrics.length - 1 ? '1px solid var(--panel-border)' : 'none',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  fontSize: '58px',
                  lineHeight: 1,
                  color: 'var(--panel-text)',
                }}
              >
                <NumberTicker value={m.value} suffix={m.suffix} delay={i * 0.2} decimalPlaces={m.decimals} />
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--panel-muted)',
                  marginTop: '14px',
                }}
              >
                {m.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
