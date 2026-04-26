'use client'

import Link from 'next/link'
import { useState } from 'react'

const FOOTER_LINKS = {
  Product: [
    { label: 'Bug Explainer', href: '/features/bug-explainer' },
    { label: 'Homework Solver', href: '/features/homework' },
    { label: 'Writing Assistant', href: '/features/writing' },
    { label: 'Mock Interview', href: '/features/interview' },
    { label: 'Pricing', href: '#pricing' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Press', href: '/press' },
  ],
  Resources: [
    { label: 'Documentation', href: '/docs' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Support', href: '/support' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ],
}

export default function Footer() {
  const [focused, setFocused] = useState(false)

  return (
    <>
      <style>{`
        .footer-link { font-family: var(--font-body); font-size: 14px; color: var(--panel-muted); text-decoration: none; transition: color var(--transition-fast); }
        .footer-link:hover { color: var(--panel-text); }
        .footer-social { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--r-md); border: 1px solid var(--panel-border); color: var(--panel-muted); text-decoration: none; transition: color var(--transition-fast), border-color var(--transition-fast); }
        .footer-social:hover { color: var(--panel-text); border-color: var(--panel-border-med); }
        .footer-legal-link { font-size: 13px; color: var(--panel-muted); text-decoration: none; transition: color var(--transition-fast); }
        .footer-legal-link:hover { color: var(--panel-text); }
        .footer-subscribe-btn { padding: 10px 14px; background: var(--panel-bg-3); border: none; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--panel-muted); font-family: var(--font-body); transition: color var(--transition-fast); white-space: nowrap; }
        .footer-subscribe-btn:hover { color: var(--panel-text); }
      `}</style>

      <footer
        style={{
          background: 'var(--panel-bg)',
          borderTop: '1px solid var(--panel-border)',
          overflow: 'hidden',
        }}
      >
        <div className="container" style={{ paddingTop: '72px' }}>
          {/* Top grid */}
          <div className="footer-top-grid">
            {/* Brand column */}
            <div style={{ maxWidth: '320px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '7px',
                    border: '1px solid var(--panel-text)',
                  }}
                >
                  <div
                    style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--panel-text)' }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '16px',
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: 'var(--panel-text)',
                  }}
                >
                  BrainMate
                </span>
              </div>

              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  fontSize: '15px',
                  lineHeight: 1.65,
                  color: 'var(--panel-muted)',
                  maxWidth: '26ch',
                  marginBottom: '24px',
                }}
              >
                The AI workspace that teaches clearly, responds calmly, and stays out of the way.
              </p>

              {/* Social icons */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
                <a
                  href="https://twitter.com"
                  aria-label="Twitter"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-social"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.75l7.73-8.835L2.5 2.25h6.063l4.26 5.632 5.421-5.632ZM17.06 19.77h1.833L7.084 4.126H5.117L17.06 19.77Z" />
                  </svg>
                </a>
                <a
                  href="https://github.com"
                  aria-label="GitHub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-social"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10Z" />
                  </svg>
                </a>
              </div>

              {/* Newsletter input */}
              <div
                style={{
                  display: 'flex',
                  borderRadius: 'var(--r-md)',
                  overflow: 'hidden',
                  border: `1px solid ${focused ? 'var(--panel-border-med)' : 'var(--panel-border)'}`,
                  outline: focused ? '2px solid var(--accent-border)' : 'none',
                  transition: 'border-color var(--transition-fast), outline var(--transition-fast)',
                }}
              >
                <input
                  type="email"
                  placeholder="Your email"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'var(--panel-bg-2)',
                    border: 'none',
                    outline: 'none',
                    fontSize: '13px',
                    color: 'var(--panel-text)',
                    fontFamily: 'var(--font-body)',
                  }}
                />
                <button className="footer-subscribe-btn">Subscribe</button>
              </div>
            </div>

            {/* Link columns */}
            {Object.entries(FOOTER_LINKS).map(([title, links]) => (
              <div key={title}>
                <h4
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'var(--panel-muted)',
                    marginBottom: '20px',
                  }}
                >
                  {title}
                </h4>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '14px', listStyle: 'none', padding: 0, margin: 0 }}>
                  {links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="footer-link">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Watermark wordmark */}
          <div
            aria-hidden="true"
            style={{
              borderTop: '1px solid var(--panel-border)',
              paddingTop: '52px',
              paddingBottom: '52px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 'clamp(80px, 13vw, 168px)',
                color: 'rgba(255, 248, 235, 0.036)',
                textAlign: 'center',
                lineHeight: 1,
                letterSpacing: '-0.025em',
                whiteSpace: 'nowrap',
                userSelect: 'none',
                pointerEvents: 'none',
                margin: 0,
              }}
            >
              BrainMate
            </p>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to right, var(--panel-bg) 0%, transparent 8%, transparent 92%, var(--panel-bg) 100%)',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid var(--panel-border)',
              padding: '20px 0 32px',
              gap: '20px',
              flexWrap: 'wrap',
            }}
          >
            {/* Status pill */}
            <a
              href="/status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '9999px',
                border: '1px solid var(--panel-border)',
                background: 'var(--panel-bg-2)',
                padding: '8px 16px',
                textDecoration: 'none',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                  boxShadow: '0 0 0 3px var(--success-ring)',
                  flexShrink: 0,
                  display: 'inline-block',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--panel-muted)',
                }}
              >
                All systems operational
              </span>
            </a>

            {/* Legal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: 'var(--panel-muted)' }}>
                © 2026 BrainMate AI. Built in India.
              </span>
              <Link href="/privacy" className="footer-legal-link">Privacy</Link>
              <Link href="/terms" className="footer-legal-link">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
