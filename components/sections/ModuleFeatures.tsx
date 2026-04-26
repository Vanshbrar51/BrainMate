'use client'

import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Code2, LayoutTemplate, Mic, PenTool } from 'lucide-react'

type FeatureAccent = 'warm' | 'cool'

interface FeatureItem {
  icon: typeof Code2
  title: string
  description: string
  detail?: string
  accent: FeatureAccent
  modeLabel: string
}

const primaryFeatures: FeatureItem[] = [
  {
    icon: Code2,
    title: 'DevHelper',
    description:
      'Technical reasoning for debugging, architecture decisions, and code explanation.',
    detail:
      'Built to preserve depth when the work becomes complex, rather than collapsing everything into a shortcut.',
    accent: 'warm',
    modeLabel: 'Core technical mode',
  },
  {
    icon: BookOpen,
    title: 'StudyMate',
    description:
      'Structured learning support that breaks difficult topics into a path you can follow.',
    detail:
      'A quieter way to learn: less noise, more progression, and clearer mental models over time.',
    accent: 'cool',
    modeLabel: 'Structured learning mode',
  },
]

const secondaryFeatures: FeatureItem[] = [
  {
    icon: PenTool,
    title: 'WriteRight',
    description: 'Editorial help for clearer drafting and tone control.',
    accent: 'warm',
    modeLabel: 'Writing mode',
  },
  {
    icon: Mic,
    title: 'InterviewPro',
    description: 'Practice loops for sharper answers and calmer delivery.',
    accent: 'cool',
    modeLabel: 'Interview mode',
  },
  {
    icon: LayoutTemplate,
    title: 'ContentFlow',
    description: 'Planning structure for outlines, briefs, and content systems.',
    accent: 'warm',
    modeLabel: 'Content mode',
  },
]

const sectionTheme: CSSProperties = {
  '--module-bg': '#faf9f5',
  '--module-surface': 'rgba(255,255,255,0.6)',
  '--module-ink': '#141413',
  '--module-muted': '#b0aea5',
  '--module-line': '#e8e6dc',
  '--module-warm': '#d97757',
  '--module-warm-soft': 'rgba(217,119,87,0.07)',
  '--module-cool': '#6a9bcc',
  '--module-cool-soft': 'rgba(106,155,204,0.07)',
} as CSSProperties

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
  },
}

const groupReveal = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
}

function getAccentStyles(accent: FeatureAccent) {
  return accent === 'warm'
    ? {
        color: 'var(--module-warm)',
        background: 'var(--module-warm-soft)',
      }
    : {
        color: 'var(--module-cool)',
        background: 'var(--module-cool-soft)',
      }
}

export default function ModuleFeatures() {
  return (
    <section
      id="features"
      style={sectionTheme}
      className="relative overflow-hidden border-t border-[var(--module-line)] bg-[var(--module-bg)] py-28 md:py-32"
    >
      {/* Ambient fill */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-14 h-28 w-28 rounded-full bg-[var(--module-warm-soft)] blur-3xl" />
        <div className="absolute right-[8%] bottom-16 h-24 w-24 rounded-full bg-[var(--module-cool-soft)] blur-3xl" />
      </div>

      <div className="container relative z-10 max-w-[1180px]">
        {/* Section header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-120px' }}
          className="grid gap-8 pb-14 md:pb-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end"
        >
          <div>
            <div className="inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--module-muted)]">
              <span className="h-px w-8 bg-[color:rgba(106,155,204,0.45)]" />
              Modules
            </div>
            <h2
              className="mt-6 max-w-[8ch] text-[clamp(2.75rem,5vw,4.6rem)] font-medium tracking-[-0.06em] text-[var(--module-ink)]"
              style={{ fontFamily: 'var(--font-display)', lineHeight: 0.96 }}
            >
              Five engines. One quiet system.
            </h2>
          </div>

          <p className="max-w-[52ch] text-[17px] leading-[1.75] text-[color:rgba(20,20,19,0.6)] md:text-[18px] lg:justify-self-end lg:pb-1">
            The product shifts its intelligence to match the task, while keeping
            one calm interface throughout. The hierarchy comes from purpose, not
            decoration.
          </p>
        </motion.div>

        {/* Card grid */}
        <motion.div
          variants={groupReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="space-y-5 md:space-y-6"
        >
          {/* Primary tier — two weighted cards */}
          <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
            {primaryFeatures.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.article
                  key={feature.title}
                  variants={fadeUp}
                  whileHover={{ y: -3, scale: 1.015 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex flex-col justify-between rounded-xl border border-[var(--module-line)] bg-[var(--module-surface)] p-7 shadow-[0_1px_3px_rgba(20,20,19,0.04),0_0_0_1px_rgba(20,20,19,0.03)] backdrop-blur-sm md:p-9 ${
                    index === 0 ? 'lg:col-span-7' : 'lg:col-span-5'
                  }`}
                >
                  <div>
                    {/* Icon mark */}
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={getAccentStyles(feature.accent)}
                    >
                      <Icon size={15} strokeWidth={1.8} />
                    </div>

                    <p className="mt-7 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--module-muted)]">
                      {feature.modeLabel}
                    </p>
                    <h3 className="mt-3 text-[clamp(1.65rem,2.8vw,2.2rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--module-ink)]">
                      {feature.title}
                    </h3>
                    <p className="mt-4 max-w-[30ch] text-[17px] leading-[1.72] text-[color:rgba(20,20,19,0.68)] md:text-[18px]">
                      {feature.description}
                    </p>
                  </div>

                  <div className="mt-9 border-t border-[var(--module-line)] pt-5">
                    <p className="max-w-[44ch] text-[14px] leading-[1.72] text-[color:rgba(20,20,19,0.5)] md:text-[15px]">
                      {feature.detail}
                    </p>
                  </div>
                </motion.article>
              )
            })}
          </div>

          {/* Secondary tier — three compact cards */}
          <div className="grid gap-4 md:grid-cols-3 md:gap-5">
            {secondaryFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <motion.article
                  key={feature.title}
                  variants={fadeUp}
                  whileHover={{ y: -3, scale: 1.015 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="group flex flex-col rounded-xl border border-[var(--module-line)] bg-[var(--module-surface)] p-6 shadow-[0_1px_3px_rgba(20,20,19,0.04),0_0_0_1px_rgba(20,20,19,0.03)] backdrop-blur-sm md:p-7"
                >
                  {/* Icon mark */}
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-300"
                    style={getAccentStyles(feature.accent)}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                  </div>

                  <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--module-muted)]">
                    {feature.modeLabel}
                  </p>
                  <h3 className="mt-2.5 text-[21px] font-semibold leading-[1.08] tracking-[-0.035em] text-[var(--module-ink)] md:text-[23px]">
                    {feature.title}
                  </h3>
                  <p className="mt-3 max-w-[26ch] text-[15px] leading-[1.72] text-[color:rgba(20,20,19,0.62)] md:text-[16px]">
                    {feature.description}
                  </p>
                </motion.article>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
