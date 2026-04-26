'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { BlurFade } from '@/components/magicui/blur-fade'
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { NumberTicker } from '@/components/magicui/number-ticker'
import { useRouter } from 'next/navigation'

const stats = [
  { value: 220000, suffix: '+', label: 'Active learners', decimals: 0 },
  { value: 98, suffix: '%', label: 'Satisfaction rate', decimals: 0 },
  { value: 40, suffix: '+', label: 'Languages supported', decimals: 0 },
]

export default function Hero() {
  const router = useRouter()

  return (
    <section className="hero-section bg-[var(--bg)] pt-28 md:pt-36">
      {/* Ambient warm glow */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '780px',
            height: '320px',
            background: 'radial-gradient(ellipse at 50% 35%, var(--glow-top) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        {/* Warm orbs */}
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '18%',
            width: '380px',
            height: '380px',
            background: 'radial-gradient(circle, var(--glow-top) 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'orb-a 18s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '12%',
            right: '14%',
            width: '320px',
            height: '320px',
            background: 'radial-gradient(circle, var(--glow-bottom) 0%, transparent 70%)',
            borderRadius: '50%',
            animation: 'orb-b 22s ease-in-out infinite',
          }}
        />
      </div>

      <div className="container relative z-10 text-center">
        {/* Badge */}
        <BlurFade delay={0} duration={0.6}>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--border-warm)] bg-[var(--surface)] px-3.5 py-1.5 shadow-[var(--shadow-xs)]">
            <span
              className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
              style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }}
            />
            <AnimatedShinyText className="text-[12px] font-medium tracking-[0.1em] text-[var(--text-2)] uppercase">
              Five AI tools. Built to teach.
            </AnimatedShinyText>
          </div>
        </BlurFade>

        {/* H1 */}
        <BlurFade delay={0.12} duration={0.7}>
          <h1
            className="mx-auto max-w-[880px] text-[var(--text-1)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'var(--text-hero)',
              lineHeight: 1.01,
              letterSpacing: '-0.045em',
            }}
          >
            The AI that <em>teaches</em>,<br className="hidden md:block" />
            not just answers.
          </h1>
        </BlurFade>

        <BlurFade delay={0.2} duration={0.7}>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 'clamp(18px, 2.2vw, 24px)',
              fontWeight: 400,
              color: 'var(--text-3)',
              letterSpacing: '-0.02em',
              lineHeight: 1.3,
              marginTop: '20px',
            }}
          >
            Because understanding is the only shortcut that works.
          </p>
        </BlurFade>

        {/* Subtext */}
        <BlurFade delay={0.24} duration={0.7}>
          <p
            className="mx-auto mt-7 max-w-[600px] text-[var(--text-2)]"
            style={{ fontFamily: 'var(--font-body)', fontSize: '17px', lineHeight: 1.7, fontWeight: 400 }}
          >
            Code, study, write, prepare for interviews, and create content in one workspace built to explain — not overwhelm.
          </p>
        </BlurFade>

        {/* CTAs */}
        <BlurFade delay={0.36} duration={0.7}>
          <div className="cta-buttons mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row md:mt-12">
            <ShimmerButton
              shimmerColor="rgba(255,248,235,0.15)"
              background="var(--text-1)"
              className="rounded-[var(--r-md)] text-[14px] font-semibold"
              style={{ color: 'var(--text-inv)' }}
              onClick={() => router.push('/sign-up')}
            >
              Start free
            </ShimmerButton>
            <Link
              href="#features"
              className="inline-flex items-center justify-center rounded-[var(--r-md)] border border-[var(--border-med)] bg-transparent px-7 py-3 text-[14px] font-medium text-[var(--text-1)] transition-colors hover:bg-[var(--bg-warm)]"
            >
              See how it works →
            </Link>
          </div>

          {/* Trust microcopy */}
          <p className="mt-5 text-[12px] text-[var(--text-3)]">
            220,000+ learners · No credit card · Free forever
          </p>
        </BlurFade>
      </div>

      {/* Hero mockup card region */}
      <div className="relative z-10 mt-16 md:mt-20">
        <div className="container" style={{ paddingBottom: 0 }}>
          {/* Floating proof pills */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute -top-5 left-6 z-10 hidden md:flex"
              style={{ animation: 'orb-a 8s ease-in-out infinite', animationDelay: '1s' }}
            >
              <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 shadow-[var(--shadow-sm)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                <span className="text-[12px] font-medium text-[var(--text-2)]">Root cause found</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute -top-5 right-6 z-10 hidden md:flex"
            >
              <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 shadow-[var(--shadow-sm)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                <span className="text-[12px] font-medium text-[var(--text-2)]">98% confidence</span>
              </div>
            </motion.div>

            {/* Mockup card */}
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              className="hero-mockup-card"
            >
              <div style={{ display: 'grid', gridTemplateColumns: '42% 58%', minHeight: '420px' }}>
                {/* Left: dark code panel */}
                <div
                  className="hero-code-panel"
                  style={{
                    padding: '28px',
                    background: 'var(--panel-bg)',
                    borderRight: '1px solid var(--panel-border)',
                  }}
                >
                  {/* Editor header */}
                  <div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--chrome-red)' }} />
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--chrome-yellow)' }} />
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--chrome-green)' }} />
                    </div>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--panel-muted)', marginBottom: '16px' }}>
                      bug_explainer.py
                    </p>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', lineHeight: 1.75 }}>
                      <p><span style={{ color: 'var(--syntax-keyword)' }}>def</span> <span style={{ color: 'var(--syntax-string)' }}>calculate_average</span>(numbers):</p>
                      <p style={{ paddingLeft: '18px' }}><span style={{ color: 'var(--syntax-keyword)' }}>total</span> = <span style={{ color: 'var(--syntax-symbol)' }}>0</span></p>
                      <p style={{ paddingLeft: '18px' }}><span style={{ color: 'var(--syntax-keyword)' }}>for</span> num <span style={{ color: 'var(--syntax-keyword)' }}>in</span> numbers:</p>
                      <p style={{ paddingLeft: '36px' }}>total += num</p>
                      <div style={{ marginTop: '4px', padding: '4px 8px', background: 'var(--danger-bg)', borderRadius: '4px', borderLeft: '2px solid var(--syntax-error)' }}>
                        <p><span style={{ color: 'var(--syntax-keyword)' }}>return</span> total / <span style={{ color: 'var(--syntax-symbol)' }}>len</span>(numbers)</p>
                      </div>
                      <p style={{ marginTop: '8px', color: 'var(--syntax-error)', fontSize: '11px' }}>
                        # ZeroDivisionError: division by zero
                      </p>
                    </div>
                  </div>
                  {/* Thinking indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '16px', borderTop: '1px solid var(--panel-border)' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            animation: `thinking-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--panel-muted)' }}>
                      Analysing bug…
                    </span>
                  </div>
                </div>

                {/* Right: light explanation panel */}
                <div style={{ padding: '28px', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: '8px' }}>
                      Root cause
                    </p>
                    <p style={{ fontSize: '14px', color: 'var(--text-1)', lineHeight: 1.65, fontWeight: 500 }}>
                      Empty list passed to function
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.65, marginTop: '6px' }}>
                      When <code>numbers</code> is empty, <code>len(numbers)</code> evaluates to 0, causing a division-by-zero error.
                    </p>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: '8px' }}>
                      Fix
                    </p>
                    <div style={{ background: 'var(--bg-subtle)', borderRadius: '8px', padding: '12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6 }}>
                      <p><span style={{ color: 'var(--success)' }}>if not numbers:</span></p>
                      <p style={{ paddingLeft: '16px', color: 'var(--text-3)' }}><span style={{ color: 'var(--syntax-keyword)' }}>return</span> <span style={{ color: 'var(--syntax-symbol)' }}>None</span></p>
                      <p style={{ color: 'var(--success)' }}>return total / len(numbers)</p>
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        background: 'var(--accent-subtle)',
                        borderRadius: 'var(--r-md)',
                        border: '1px solid var(--accent-border)',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--accent-muted)', fontWeight: 500 }}>
                        Practice problem ready →
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Stats row */}
        <div className="container hero-stats-3">
          <div className="flex items-center justify-center gap-0" style={{ flexWrap: 'wrap' }}>
            {stats.map((stat, i) => (
              <div key={stat.label} style={{ display: 'flex', alignItems: 'stretch' }}>
                {i > 0 && (
                  <div
                    style={{
                      width: '1px',
                      height: '36px',
                      background: 'var(--border-med)',
                      alignSelf: 'center',
                      margin: '0 28px',
                    }}
                  />
                )}
                <div className="text-center">
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      fontSize: '38px',
                      fontWeight: 400,
                      color: 'var(--text-1)',
                      lineHeight: 1,
                    }}
                  >
                    <NumberTicker value={stat.value} suffix={stat.suffix} decimalPlaces={stat.decimals} />
                  </div>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-3)',
                      marginTop: '6px',
                    }}
                  >
                    {stat.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
