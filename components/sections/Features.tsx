import Link from 'next/link'
import { Check } from 'lucide-react'

export default function Features() {
  return (
    <section id="features" className="section-warm">
      <div className="container">
        {/* Section header */}
        <div className="mx-auto mb-20 max-w-[640px] text-center reveal">
          <div className="mb-5 flex items-center justify-center gap-3">
            <div style={{ height: '1px', width: '32px', background: 'var(--accent)', opacity: 0.7 }} />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--accent)',
              }}
            >
              Platform
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
            Five tools. One workspace.
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '17px',
              lineHeight: 1.65,
              color: 'var(--text-2)',
              marginTop: '20px',
            }}
          >
            Each module is purpose-built to teach, not just answer. Together, they cover every mode of learning.
          </p>
        </div>

        {/* Row 1 — Bug Explainer */}
        <div className="feature-row reveal">
          {/* Text */}
          <div>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--text-3)',
                display: 'block',
                marginBottom: '16px',
              }}
            >
              01 — Bug Explainer
            </span>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 400,
                fontSize: '30px',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: 'var(--text-1)',
                marginBottom: '18px',
              }}
            >
              Errors explained like a senior dev is reading over your shoulder.
            </h3>
            <p style={{ fontSize: '15px', lineHeight: 1.65, color: 'var(--text-2)', marginBottom: '24px' }}>
              Paste broken code. Get the root cause, a plain-language explanation, and a fixed version — in seconds. Supports 40+ languages.
            </p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
              {['Root cause analysis', 'Step-by-step fix walkthrough', 'Edge case detection'].map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text-2)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
                    <Check size={10} strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/sign-up" className="link-arrow" style={{ fontSize: '15px' }}>
              Try Bug Explainer →
            </Link>
          </div>

          {/* Visual: code panel */}
          <div className="hover-lift" style={{ borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div className="feature-visual-accent" />
            <div style={{ background: 'var(--panel-bg)', padding: '24px' }}>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--chrome-red)' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--chrome-yellow)' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--chrome-green)' }} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', lineHeight: 1.75, color: 'var(--panel-text)' }}>
                <p><span style={{ color: 'var(--syntax-keyword)' }}>const</span> <span style={{ color: 'var(--syntax-string)' }}>fetchUser</span> = <span style={{ color: 'var(--syntax-keyword)' }}>async</span> (id) =&gt; {'{'}</p>
                <p style={{ paddingLeft: '16px' }}><span style={{ color: 'var(--syntax-keyword)' }}>const</span> res = <span style={{ color: 'var(--syntax-keyword)' }}>await</span> fetch(`/api/users/${'{'}id{'}'}`)</p>
                <div style={{ paddingLeft: '16px', background: 'var(--danger-bg)', borderLeft: '2px solid var(--syntax-error)', padding: '4px 4px 4px 16px', margin: '2px 0' }}>
                  <p><span style={{ color: 'var(--syntax-keyword)' }}>return</span> res.json</p>
                </div>
                <p>{'}'}</p>
              </div>
            </div>
            <div style={{ background: 'var(--surface)', padding: '20px 24px', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-3)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Issue found</p>
              <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.6 }}>
                <code style={{ color: 'var(--accent)', background: 'var(--accent-subtle)' }}>res.json</code> is a method reference, not an invocation. Call it as <code>res.json()</code> to parse the response body.
              </p>
            </div>
          </div>
        </div>

        {/* Row 2 — Homework Solver (visual left, text right) */}
        <div className="feature-row reveal" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Visual: step-by-step math */}
          <div className="hover-lift order-2 md:order-1" style={{ borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="feature-visual-accent" />
            <div style={{ padding: '28px' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--text-3)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Solving: ∫ x² dx from 0 to 3
              </p>
              {[
                { n: '01', label: 'Apply power rule', detail: '∫ xⁿ dx = xⁿ⁺¹ / (n+1) + C', active: true },
                { n: '02', label: 'Antiderivative', detail: 'F(x) = x³/3' },
                { n: '03', label: 'Evaluate bounds', detail: 'F(3) − F(0) = 27/3 − 0 = 9' },
              ].map((step) => (
                <div
                  key={step.n}
                  style={{
                    display: 'flex',
                    gap: '14px',
                    alignItems: 'flex-start',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 600,
                      flexShrink: 0,
                      background: step.active ? 'var(--accent)' : 'var(--bg-subtle)',
                      color: step.active ? 'white' : 'var(--text-3)',
                      border: step.active ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    {step.n}
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-1)', marginBottom: '4px' }}>{step.label}</p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-3)' }}>{step.detail}</p>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>Result</span>
                <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '22px', color: 'var(--text-1)' }}>= 9</span>
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="order-1 md:order-2">
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', display: 'block', marginBottom: '16px' }}>
              02 — Homework Solver
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '30px', letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--text-1)', marginBottom: '18px' }}>
              Don&apos;t just get the answer. Understand the method.
            </h3>
            <p style={{ fontSize: '15px', lineHeight: 1.65, color: 'var(--text-2)', marginBottom: '24px' }}>
              BrainMate walks through each step — so the next problem is easier, not harder. Maths, science, history, literature.
            </p>
            <Link href="/sign-up" className="link-arrow" style={{ fontSize: '15px' }}>
              Try Homework Solver →
            </Link>
          </div>
        </div>

        {/* Row 3 — Writing Assistant */}
        <div className="feature-row reveal" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
          {/* Text */}
          <div>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-3)', display: 'block', marginBottom: '16px' }}>
              03 — Writing Assistant
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '30px', letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--text-1)', marginBottom: '18px' }}>
              Clarity, not decoration. Better writing, explained.
            </h3>
            <p style={{ fontSize: '15px', lineHeight: 1.65, color: 'var(--text-2)', marginBottom: '24px' }}>
              Paste any text. Get specific edits with reasons — not just a rewrite. Your voice, sharpened.
            </p>
            <Link href="/sign-up" className="link-arrow" style={{ fontSize: '15px' }}>
              Try Writing Assistant →
            </Link>
          </div>

          {/* Visual: before/after diff */}
          <div className="hover-lift" style={{ borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div className="feature-visual-accent" />
            <div style={{ background: 'var(--surface)', padding: '24px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: '16px' }}>
                Revision diff
              </p>
              {/* Before */}
              <div style={{ borderLeft: '2px solid var(--error)', background: 'rgba(192,57,43,0.04)', padding: '12px 16px', borderRadius: '0 6px 6px 0', marginBottom: '10px' }}>
                <p style={{ fontSize: '13px', lineHeight: 1.65, color: 'var(--text-2)' }}>
                  The new feature is really very good and it definitely makes things a lot better for the users.
                </p>
                <p style={{ fontSize: '11px', color: 'var(--error)', marginTop: '6px', fontWeight: 500 }}>− Original</p>
              </div>
              {/* After */}
              <div style={{ borderLeft: '2px solid var(--success)', background: 'rgba(45,106,79,0.04)', padding: '12px 16px', borderRadius: '0 6px 6px 0' }}>
                <p style={{ fontSize: '13px', lineHeight: 1.65, color: 'var(--text-2)' }}>
                  The new feature significantly improves the user experience.
                </p>
                <p style={{ fontSize: '11px', color: 'var(--success)', marginTop: '6px', fontWeight: 500 }}>+ Revised</p>
              </div>
              <div style={{ marginTop: '16px', padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px' }}>
                <p style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text-1)' }}>Why:</strong> Removed redundant adverbs (&quot;really very&quot;, &quot;definitely&quot;, &quot;a lot&quot;). Active construction, half the words, clearer intent.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Two-card pair */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginTop: '88px',
          }}
          className="reveal"
        >
          {[
            {
              num: '04',
              title: 'Mock Interview',
              desc: 'Real questions, adaptive difficulty, immediate feedback on your thinking — not just your answer.',
              cta: 'Try Mock Interview',
            },
            {
              num: '05',
              title: 'Content Repurposer',
              desc: 'Turn a blog post into a Twitter thread, a LinkedIn post, and a newsletter — in one click.',
              cta: 'Try Content Repurposer',
            },
          ].map((card) => (
            <div
              key={card.num}
              className="hover-lift"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-xl)',
                padding: '36px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '16px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>{card.num}</span>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '24px', letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
                  {card.title}
                </h3>
              </div>
              <p style={{ fontSize: '15px', lineHeight: 1.65, color: 'var(--text-2)', marginBottom: '24px' }}>
                {card.desc}
              </p>
              {card.num === '04' && (
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    padding: '14px 16px',
                    marginBottom: '24px',
                  }}
                >
                  <p
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--text-3)',
                      marginBottom: '10px',
                    }}
                  >
                    Sample question
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.55 }}>
                    &quot;Explain the difference between a process and a thread. When would you use one over the
                    other?&quot;
                  </p>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {['Systems Design', 'OS Concepts', 'Senior Level'].map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-3)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {card.num === '05' && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
                  {[
                    { platform: 'Twitter', count: '6 tweets' },
                    { platform: 'LinkedIn', count: '1 post' },
                    { platform: 'Newsletter', count: '400 words' },
                  ].map((item) => (
                    <div
                      key={item.platform}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '10px 14px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-md)',
                        minWidth: '80px',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 500 }}>{item.platform}</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontStyle: 'italic',
                          fontSize: '15px',
                          color: 'var(--text-1)',
                        }}
                      >
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/sign-up" className="link-arrow" style={{ fontSize: '14px' }}>
                {card.cta} →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
