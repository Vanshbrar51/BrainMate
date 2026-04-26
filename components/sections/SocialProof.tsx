import { Marquee } from '@/components/magicui/marquee'

const companies = [
  'Google', 'Microsoft', 'Amazon', 'Meta', 'Apple',
  'Netflix', 'Stripe', 'Notion', 'Figma', 'Linear',
  'Vercel', 'Anthropic', 'OpenAI', 'ByteDance', 'Razorpay',
  'Zerodha', 'Swiggy', 'Zomato', 'CRED', 'Atlassian',
]

export default function SocialProof() {
  return (
    <section
      style={{
        padding: '72px 0',
        background: 'var(--bg-subtle)',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div className="container text-center" style={{ marginBottom: '40px', paddingTop: '8px' }}>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--text-3)',
            marginBottom: '12px',
          }}
        >
          Trusted by engineers at
        </p>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: 'var(--text-2)',
            letterSpacing: '-0.01em',
            lineHeight: 1.4,
          }}
        >
          companies where getting the answer right matters.
        </p>
      </div>

      {/* Fade edge masks */}
      <div style={{ position: 'relative' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '120px',
            background: 'linear-gradient(to right, var(--bg-subtle), transparent)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '120px',
            background: 'linear-gradient(to left, var(--bg-subtle), transparent)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        <Marquee pauseOnHover repeat={2} className="[--duration:40s] [--gap:0px]">
          {companies.map((company, idx) => (
            <span key={`${company}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <span
                className="marquee-company-name"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-3)',
                  padding: '0 20px',
                  transition: 'color 200ms ease',
                  cursor: 'default',
                  whiteSpace: 'nowrap',
                }}
              >
                {company}
              </span>
              <span aria-hidden="true" style={{ color: 'var(--border-med)', fontSize: '10px', flexShrink: 0 }}>
                ·
              </span>
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  )
}
