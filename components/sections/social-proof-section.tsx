'use client'

import { InfiniteMovingCards } from '@/components/aceternity/infinite-moving-cards'

export function SocialProofSection() {
  const testimonials = [
    {
      quote: 'Finally understood recursion after two years. The explanations are clear without feeling overproduced.',
      name: 'Rahul',
      title: 'IIT Delhi',
    },
    {
      quote: 'Bug explained in under a minute. It replaced a lot of frantic searching across tabs.',
      name: 'Priya',
      title: 'CS Student',
    },
    {
      quote: 'It feels less like an answer bot and more like a patient senior engineer beside you.',
      name: 'Alex',
      title: 'Junior Developer',
    },
    {
      quote: 'My assignments make sense now because the AI actually walks through the reasoning.',
      name: 'Sam',
      title: 'High School Senior',
    },
  ]

  return (
    <section className="bg-[color:var(--surface-100)] py-20 md:py-24" data-section="social-proof">
      <div className="mx-auto max-w-6xl px-6 text-center lg:px-12" data-reveal="social">
        <h3 className="mx-auto max-w-2xl text-[28px] font-heading font-semibold tracking-tight text-[color:var(--ink-800)] md:text-[34px]">
          Trusted by developers and students who prefer clarity over clutter
        </h3>

        <div className="mt-10 md:mt-12">
          <InfiniteMovingCards items={testimonials} direction="left" speed="normal" />
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {['Bug Explainability', 'Concept Teaching', 'Interview Prep', 'Writing Polish'].map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-[color:var(--surface-300)] bg-[color:rgba(255,255,255,0.72)] px-3.5 py-1.5 text-[12px] font-medium tracking-[0.02em] text-[color:var(--ink-700)] backdrop-blur-sm"
            >
              {pill}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
