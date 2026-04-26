import Link from 'next/link'

export default function CTA() {
  return (
    <section
      className="section-dark grain"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* Warm grid overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,248,235,0.012) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,248,235,0.012) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Terracotta centre glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '700px',
          height: '400px',
          background: 'radial-gradient(ellipse, var(--glow-top) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div
        className="container"
        style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}
      >
        {/* Section eyebrow */}
        <p
          className="reveal"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--panel-muted)',
            marginBottom: '24px',
          }}
        >
          Start today
        </p>

        {/* Heading */}
        <h2
          className="reveal reveal-delay-1"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            fontSize: 'clamp(38px, 5vw, 58px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            color: 'var(--panel-text)',
            maxWidth: '700px',
            margin: '0 auto',
          }}
        >
          The AI that explains<br />
          <em>until you understand.</em>
        </h2>

        {/* CTAs */}
        <div
          className="cta-buttons reveal reveal-delay-2"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginTop: '40px',
          }}
        >
          <Link
            href="/sign-up"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '164px',
              borderRadius: 'var(--r-md)',
              padding: '13px 28px',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              background: 'var(--panel-text)',
              color: 'var(--panel-bg)',
              transition: 'opacity var(--transition-base)',
              opacity: 1,
            }}
          >
            Start free
          </Link>
          <Link
            href="#features"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '164px',
              borderRadius: 'var(--r-md)',
              padding: '13px 28px',
              fontSize: '14px',
              fontWeight: 400,
              textDecoration: 'none',
              border: '1px solid var(--panel-border)',
              color: 'var(--panel-muted)',
              transition: 'border-color var(--transition-base), color var(--transition-base)',
            }}
          >
            See features
          </Link>
        </div>

        {/* Trust items */}
        <p
          className="reveal reveal-delay-3"
          style={{
            fontSize: '12px',
            color: 'var(--panel-muted)',
            marginTop: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px 32px',
            flexWrap: 'wrap',
          }}
        >
          {['No credit card', 'Cancel anytime', 'SOC 2 compliant', 'GDPR ready'].map((item, i, arr) => (
            <span key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {item}
              {i < arr.length - 1 && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '3px',
                    height: '3px',
                    borderRadius: '50%',
                    background: 'var(--panel-border-med)',
                  }}
                />
              )}
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}
