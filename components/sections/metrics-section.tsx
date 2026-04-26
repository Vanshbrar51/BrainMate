'use client'

import { ArrowRight } from 'lucide-react'
import { AnimatedCounter } from '@/components/shared/AnimatedCounter'
import { Button } from '@/components/ui/button'

export function MetricsSection() {
  const metrics = [
    { label: 'Monthly Learners', value: 220, suffix: 'K+' },
    { label: 'Productivity Lift', value: 67, suffix: '%' },
    { label: 'Bug Fix Speed', value: 3, suffix: '.2x' },
    { label: 'Creator Output', value: 4, suffix: '.8x' },
  ]

  return (
    <section className="relative overflow-hidden bg-[color:var(--surface-solid)] py-20 lg:py-28 text-[color:var(--ink-900)]" data-section="metrics">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b0b0b_0%,#181716_55%,#403722_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 lg:px-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 text-center md:grid-cols-4" data-reveal="metrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col items-center">
              <span className="text-[44px] font-heading font-semibold tracking-tight text-white md:text-[60px] md:leading-none">
                <AnimatedCounter value={metric.value} />
                {metric.suffix}
              </span>
              <span className="mt-3 text-[12px] font-medium uppercase tracking-[0.14em] text-white/65 md:text-[13px]">
                {metric.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center md:mt-16" data-reveal="metrics">
          <p className="mx-auto max-w-2xl text-[16px] leading-8 text-white/82 md:text-[18px]">
            Teams and individuals across 40+ countries use BrainMate to learn faster and stay more focused through complex work.
          </p>
          <Button
            size="lg"
            variant="outline"
            className="mt-7 h-11 rounded-xl border-white/20 bg-white/5 px-6 text-[14px] font-semibold text-white hover:bg-white/10"
          >
            See case studies
            <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover/button:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </section>
  )
}
