'use client'

import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'

const cases = [
  {
    index: '01',
    role: 'Students',
    principle: 'Structured understanding',
    benefit:
      'Master complex topics faster with explanations that unfold in a sequence you can absorb, revisit, and actually retain.',
  },
  {
    index: '02',
    role: 'Developers',
    principle: 'Reasoning clarity',
    benefit:
      'Debug with architecture awareness and enough context to understand why a fix works instead of just copying an answer.',
  },
  {
    index: '03',
    role: 'Creators',
    principle: 'Voice with control',
    benefit:
      'Develop outlines, drafts, and revisions that preserve tone while bringing more structure to the work.',
  },
  {
    index: '04',
    role: 'Job Seekers',
    principle: 'Composure under pressure',
    benefit:
      'Practice realistic interview scenarios with feedback that improves structure, precision, and confidence.',
  },
  {
    index: '05',
    role: 'Professionals',
    principle: 'Calm execution',
    benefit:
      'Write clearer updates, reports, and communication without adding another layer of process to the day.',
  },
]

const sectionTheme: CSSProperties = {
  '--audience-bg': '#faf9f5',
  '--audience-ink': '#141413',
  '--audience-muted': '#b0aea5',
  '--audience-line': '#e8e6dc',
  '--audience-accent': '#d97757',
  '--audience-accent-cool': '#6a9bcc',
} as CSSProperties

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
  },
}

const listReveal = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
}

export default function UseCases() {
  return (
    <section
      style={sectionTheme}
      className="relative overflow-hidden border-y border-[var(--audience-line)] bg-[var(--audience-bg)] py-28 md:py-36"
    >
      {/* Ambient decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[9%] top-20 h-32 w-32 rounded-full bg-[color:rgba(106,155,204,0.04)] blur-3xl" />
        <div className="absolute left-[4%] bottom-20 h-24 w-24 rounded-full bg-[color:rgba(217,119,87,0.04)] blur-3xl" />
      </div>

      <div className="container relative z-10 max-w-[1180px]">
        {/* Section header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-120px' }}
          className="grid gap-10 pb-16 md:pb-20 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-end"
        >
          <div>
            <div className="inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--audience-muted)]">
              <span className="h-px w-8 bg-[color:rgba(217,119,87,0.5)]" />
              Audience
            </div>
            <h2
              className="mt-6 text-[clamp(2.75rem,5vw,4.6rem)] font-medium tracking-[-0.06em] text-[var(--audience-ink)]"
              style={{ fontFamily: 'var(--font-display)', lineHeight: 0.96 }}
            >
              Built for distinct ways of thinking.
            </h2>
          </div>

          <p className="max-w-[52ch] text-[17px] leading-[1.75] text-[color:rgba(20,20,19,0.6)] md:text-[18px] lg:justify-self-end lg:pb-1">
            BrainMate is designed around modes of thought, not generic personas.
            Each audience represents a different way people move through
            difficult work.
          </p>
        </motion.div>

        {/* Entry list */}
        <motion.div
          variants={listReveal}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-120px' }}
          className="border-t border-[var(--audience-line)]"
        >
          {cases.map((item) => (
            <motion.article
              key={item.role}
              variants={fadeUp}
              className="group relative border-b border-[var(--audience-line)] py-12 transition-colors duration-300 hover:border-[color:rgba(217,119,87,0.22)] md:py-14"
            >
              <div className="grid grid-cols-[2rem_1fr] gap-6 md:grid-cols-[2rem_minmax(220px,280px)_minmax(0,1fr)] md:gap-10 lg:gap-16">
                {/* Index */}
                <div className="pt-[0.35rem]">
                  <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-[var(--audience-muted)]">
                    {item.index}
                  </span>
                </div>

                {/* Role title */}
                <div className="col-start-2 md:col-start-auto">
                  <motion.h3
                    whileHover={{ x: 3 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="text-[clamp(1.8rem,3.2vw,2.7rem)] font-medium leading-[1.02] tracking-[-0.04em] text-[var(--audience-ink)]"
                  >
                    {item.role}
                  </motion.h3>
                </div>

                {/* Principle + benefit */}
                <div className="col-start-2 md:col-start-auto md:max-w-[560px]">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[color:rgba(217,119,87,0.9)]">
                    {item.principle}
                  </p>
                  <p className="mt-4 text-[17px] leading-[1.75] text-[color:rgba(20,20,19,0.68)] md:text-[18px]">
                    {item.benefit}
                  </p>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
