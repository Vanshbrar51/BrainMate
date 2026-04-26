'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false)

  const plans = [
    {
      name: 'Free',
      description: 'A simple starting point for occasional questions and lightweight workflows.',
      priceMonthly: '₹0',
      priceAnnual: '₹0',
      features: ['10 queries per day', 'Core explanations', 'Community support'],
      ctaText: 'Get Started Free',
      isPrimary: false,
      href: '/sign-up',
      note: 'No credit card required',
    },
    {
      name: 'Pro',
      description: 'For people who want BrainMate across coding, studying, writing, and prep work every day.',
      priceMonthly: '₹299',
      priceAnnual: '₹2,990',
      features: ['Unlimited daily queries', 'All BrainMate tools', 'Advanced context parsing', 'Priority support'],
      ctaText: 'Start Pro',
      isPrimary: true,
      href: '/sign-up?plan=pro',
      note: 'Save with annual billing',
    },
  ]

  return (
    <section className="relative bg-[color:var(--surface-100)] py-20 lg:py-28" data-section="pricing">
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <div className="mx-auto max-w-2xl text-center" data-reveal="pricing">
          <SectionLabel>Pricing</SectionLabel>
          <h2 className="mt-5 text-[36px] font-heading font-semibold tracking-tight text-[color:var(--ink-900)] md:text-[48px] md:leading-[1.02]">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-7 text-[color:var(--ink-700)] md:text-lg md:leading-8">
            Two plans, clear tradeoffs, and enough room to grow without re-learning the product.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-[color:var(--surface-300)] bg-[color:rgba(255,255,255,0.72)] px-4 py-2 backdrop-blur-sm">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-[color:var(--ink-900)]' : 'text-[color:var(--ink-600)]'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-[color:var(--surface-300)] transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-600)] focus:ring-offset-2"
            >
              <span className="sr-only">Toggle annual pricing</span>
              <motion.span
                layout
                className="inline-block h-4 w-4 rounded-full bg-white shadow-sm"
                animate={{ x: isAnnual ? 23 : 4 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              />
            </button>
            <span className={`flex items-center gap-2 text-sm font-medium ${isAnnual ? 'text-[color:var(--ink-900)]' : 'text-[color:var(--ink-600)]'}`}>
              Annual
              <AnimatePresence>
                {isAnnual && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="inline-flex rounded-full bg-[color:var(--brand-50)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--brand-700)]"
                  >
                    Save 17%
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2" data-reveal="pricing">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-[28px] border p-7 md:p-8 ${
                plan.isPrimary
                  ? 'border-[color:var(--brand-300)] bg-[linear-gradient(180deg,rgba(191,151,52,0.08),rgba(255,255,255,0.8))] shadow-[0_20px_50px_-30px_rgba(15,23,42,0.24)]'
                  : 'border-[color:var(--surface-300)] bg-[color:rgba(255,255,255,0.72)] shadow-[0_18px_40px_-28px_rgba(15,23,42,0.16)]'
              } backdrop-blur-sm transition-transform duration-300 hover:scale-[1.02]`}
            >
              {plan.isPrimary && (
                <div className="mb-5">
                  <Badge className="border-[color:var(--brand-300)] bg-[color:var(--brand-50)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                    Most Popular
                  </Badge>
                </div>
              )}

              {!plan.isPrimary && (
                <div className="mb-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--ink-500)]">
                  Free
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-[24px] font-heading font-semibold tracking-tight text-[color:var(--ink-900)]">
                  {plan.name}
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-[color:var(--ink-600)] md:text-[15px] md:leading-7">
                  {plan.description}
                </p>
              </div>

              <div className="mb-7 flex items-end gap-2">
                <span className="text-[44px] font-heading font-bold tracking-tight text-[color:var(--ink-900)] md:text-[52px]">
                  {isAnnual ? plan.priceAnnual : plan.priceMonthly}
                </span>
                <span className="pb-1 text-sm text-[color:var(--ink-600)]">
                  {plan.name === 'Free' ? '/ forever' : isAnnual ? '/ year' : '/ month'}
                </span>
              </div>

              <ul className="mb-8 flex flex-1 flex-col gap-3 border-t border-[color:var(--surface-200)] pt-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-[14px] leading-6 text-[color:var(--ink-800)]">
                    <CheckCircle2 className={`mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 ${plan.isPrimary ? 'text-[color:var(--brand-600)]' : 'text-[color:var(--ink-600)]'}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className={`h-11 w-full rounded-xl text-[14px] font-semibold ${
                  plan.isPrimary
                    ? 'bg-[color:var(--ink-900)] text-white hover:bg-[color:var(--ink-800)]'
                    : 'border border-[color:var(--surface-300)] bg-white text-[color:var(--ink-900)] hover:bg-[color:var(--surface-100)]'
                }`}
              >
                <a href={plan.href}>{plan.ctaText}</a>
              </Button>
              <p className="mt-3 text-center text-[12px] text-[color:var(--ink-500)]">{plan.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
