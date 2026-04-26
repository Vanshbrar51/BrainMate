'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Check } from 'lucide-react'
import { BorderBeam } from '@/components/magicui/border-beam'

const plans = [
  {
    name: 'Free',
    price: '₹0',
    period: '/ forever',
    description: 'A clean starting point for occasional use and everyday learning.',
    features: ['10 AI queries per day', 'Core product access', 'Standard response time', 'Community support'],
    cta: 'Get started free',
    href: '/sign-up',
    featured: false,
  },
  {
    name: 'Pro',
    price: '₹299',
    priceSuffix: '/mo',
    priceAnnual: '₹199',
    period: '/ month',
    description: 'For people who rely on BrainMate daily and want full-speed, full-access.',
    features: ['Unlimited queries', 'All five modules', 'Saved context & history', 'Priority support', 'Early feature access'],
    cta: 'Upgrade to Pro',
    href: '/sign-up?plan=pro',
    featured: true,
  },
]

export default function Pricing() {
  const [annual, setAnnual] = useState(false)

  return (
    <section id="pricing" className="section-warm">
      <div className="container">
        {/* Header */}
        <div className="mx-auto mb-14 max-w-[560px] text-center reveal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ height: '1px', width: '32px', background: 'var(--accent)', opacity: 0.7 }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)' }}>
              Pricing
            </span>
            <div style={{ height: '1px', width: '32px', background: 'var(--accent)', opacity: 0.7 }} />
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(28px, 4vw, 48px)',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              color: 'var(--text-1)',
            }}
          >
            Clear, honest pricing.
          </h2>
          <p style={{ fontSize: '17px', lineHeight: 1.65, color: 'var(--text-2)', marginTop: '18px' }}>
            Two plans. No clutter. Start free and move to Pro only when BrainMate becomes part of your daily workflow.
          </p>
        </div>

        {/* Billing toggle — Anthropic tab pattern */}
        <div
          className="reveal"
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '44px' }}
        >
          <div
            style={{
              display: 'flex',
              gap: '4px',
              padding: '4px',
              borderRadius: '9999px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-med)',
            }}
          >
            {(['Monthly', 'Annual'] as const).map((label) => (
              <button
                key={label}
                onClick={() => setAnnual(label === 'Annual')}
                style={{
                  padding: '7px 18px',
                  borderRadius: '9999px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: (label === 'Annual') === annual ? 500 : 400,
                  color: (label === 'Annual') === annual ? 'var(--text-1)' : 'var(--text-3)',
                  background: (label === 'Annual') === annual ? 'var(--surface)' : 'transparent',
                  boxShadow: (label === 'Annual') === annual ? 'var(--shadow-xs)' : 'none',
                  transition: 'background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast)',
                }}
              >
                {label}
                {label === 'Annual' && (
                  <span
                    style={{
                      marginLeft: '6px',
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '9999px',
                      background: 'var(--accent-subtle)',
                      color: 'var(--accent)',
                    }}
                  >
                    −34%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="pricing-grid reveal">
          {plans.map((plan) => (
            <div
              key={plan.name}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 'var(--r-2xl)',
                border: plan.featured ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                padding: '36px',
                overflow: 'hidden',
                background: plan.featured ? 'var(--surface)' : 'var(--bg-subtle)',
                boxShadow: plan.featured ? 'var(--shadow-md)' : 'var(--shadow-xs)',
              }}
            >
              {/* Inner glow for Pro */}
              {plan.featured && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(ellipse at 25% 0%, var(--accent-subtle), transparent 65%)',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* BorderBeam on Pro */}
              {plan.featured && (
                <BorderBeam size={280} duration={10} colorFrom="var(--accent)" colorTo="var(--accent-subtle)" />
              )}

              {/* Plan badge */}
              <span
                style={{
                  display: 'inline-flex',
                  width: 'fit-content',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  marginBottom: '24px',
                  background: plan.featured ? 'var(--accent-subtle)' : 'var(--bg-warm)',
                  color: plan.featured ? 'var(--accent)' : 'var(--text-3)',
                  border: `1px solid ${plan.featured ? 'var(--accent-border)' : 'var(--border)'}`,
                }}
              >
                {plan.name}
              </span>

              {/* Price */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontWeight: 400,
                      fontSize: '48px',
                      lineHeight: 1,
                      color: 'var(--text-1)',
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {annual && plan.priceAnnual ? plan.priceAnnual : plan.price}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-3)', paddingBottom: '6px' }}>
                    {plan.period}
                  </span>
                </div>
                <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--text-2)', marginTop: '12px' }}>
                  {plan.description}
                </p>
              </div>

              {/* Features */}
              <ul
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  flex: 1,
                  borderTop: '1px solid var(--border)',
                  paddingTop: '24px',
                  marginBottom: '28px',
                }}
              >
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-2)' }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        marginTop: '2px',
                        background: plan.featured ? 'var(--text-1)' : 'var(--surface)',
                        color: plan.featured ? 'var(--text-inv)' : 'var(--text-1)',
                        border: plan.featured ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      <Check size={10} strokeWidth={2.5} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={plan.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--r-md)',
                  padding: '13px 24px',
                  fontSize: '14px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'background-color var(--transition-base), color var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base)',
                  background: plan.featured ? 'var(--text-1)' : 'transparent',
                  color: plan.featured ? 'var(--text-inv)' : 'var(--text-1)',
                  border: plan.featured ? 'none' : '1px solid var(--border-med)',
                  boxShadow: plan.featured ? 'var(--shadow-sm)' : 'none',
                }}
                className={plan.featured ? 'pricing-cta pricing-cta-featured' : 'pricing-cta pricing-cta-outline'}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div
          className="reveal pricing-enterprise"
          style={{
            padding: '20px 28px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            maxWidth: '820px',
            margin: '28px auto 0',
          }}
        >
          <div>
            <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-1)', marginBottom: '4px' }}>
              Teams &amp; Education
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-3)', lineHeight: 1.5 }}>
              Volume pricing, SSO, admin dashboard, and dedicated support.
            </p>
          </div>
          <a
            href="mailto:hello@brainmate.ai"
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--accent)',
              textDecoration: 'none',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Contact us →
          </a>
        </div>

        <div
          className="reveal"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px',
            marginTop: '48px',
            flexWrap: 'wrap',
          }}
        >
          {[
            'No credit card required',
            'Cancel any time',
            'SOC 2 compliant',
            'GDPR ready',
          ].map((item, i, arr) => (
            <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: '32px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>{item}</span>
              {i < arr.length - 1 && (
                <span
                  aria-hidden
                  style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-med)', flexShrink: 0 }}
                />
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
