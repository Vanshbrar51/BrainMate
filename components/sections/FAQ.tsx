'use client'

import { useState } from 'react'

const faqs = [
  {
    question: 'Is my code and data safe with BrainMate?',
    answer: 'Yes. BrainMate follows a zero-retention approach for queries. Your code is processed securely, not stored, and never used to train the model. All data in transit is encrypted with TLS 1.3.',
  },
  {
    question: 'How is this different from ChatGPT?',
    answer: 'BrainMate is optimized for explanation, structure, and teaching — not just fast answers. The goal is to make the answer easier to understand and reuse the next time you face a similar problem.',
  },
  {
    question: 'Can I use it for competitive programming?',
    answer: 'Yes. BrainMate can explain optimal algorithms, time and space complexity, and the edge cases that usually make contest problems tricky. It walks through the logic, not just the solution.',
  },
  {
    question: 'What languages does the Bug Explainer support?',
    answer: 'It supports more than 40 major languages and common frameworks, including JavaScript, TypeScript, Python, Java, C++, Rust, Go, SQL, and more. Framework-specific context (React, Django, etc.) is understood too.',
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes. You can cancel monthly or annual billing from your dashboard at any time and retain access through the end of the active billing period. No questions, no friction.',
  },
  {
    question: 'Is there a team or student plan?',
    answer: 'Team and education pricing is available. Reach out at hello@brainmate.ai and we will get back within one business day.',
  },
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number>(0)

  return (
    <section id="faq" className="section-subtle">
      <div className="container">
        {/* Header */}
        <div className="mx-auto mb-14 max-w-[520px] text-center reveal">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ height: '1px', width: '32px', background: 'var(--accent)', opacity: 0.7 }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)' }}>
              FAQ
            </span>
            <div style={{ height: '1px', width: '32px', background: 'var(--accent)', opacity: 0.7 }} />
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(28px, 4vw, 44px)',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              color: 'var(--text-1)',
            }}
          >
            Frequently asked questions.
          </h2>
        </div>

        {/* Accordion */}
        <div
          className="mx-auto reveal"
          style={{
            maxWidth: '720px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-xl)',
            overflow: 'hidden',
            background: 'var(--surface)',
          }}
        >
          {faqs.map((faq, i) => (
            <div key={i} className="faq-item" style={i === faqs.length - 1 ? { borderBottom: 'none' } : {}}>
              <button
                onClick={() => setOpenIndex(openIndex === i ? -1 : i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '22px 28px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 400,
                    fontSize: '17px',
                    lineHeight: 1.4,
                    color: 'var(--text-1)',
                    flex: 1,
                  }}
                >
                  {faq.question}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '20px',
                    fontWeight: 300,
                    lineHeight: 1,
                    color: openIndex === i ? 'var(--accent)' : 'var(--text-3)',
                    flexShrink: 0,
                    marginTop: '2px',
                    transition: 'color 180ms ease',
                  }}
                >
                  {openIndex === i ? '−' : '+'}
                </span>
              </button>

              <div
                className={`faq-answer${openIndex === i ? ' open' : ''}`}
                style={{ padding: openIndex === i ? '0 28px 22px' : '0 28px 0' }}
              >
                <p
                  style={{
                    fontSize: '15px',
                    lineHeight: 1.7,
                    color: 'var(--text-2)',
                  }}
                >
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom contact card */}
        <div
          className="mx-auto mt-8 reveal"
          style={{ maxWidth: '720px' }}
        >
          <div
            className="faq-card"
            style={{
              padding: '20px 24px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
              transition: 'box-shadow var(--transition-fast)',
            }}
          >
            <div style={{ flex: 1, minWidth: '200px' }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-1)', marginBottom: '4px' }}>
                Still have questions?
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                We respond within 4 hours on weekdays.
              </p>
            </div>
            <a
              href="mailto:hello@brainmate.ai"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-med)',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-1)',
                textDecoration: 'none',
                transition: 'background var(--transition-fast)',
                flexShrink: 0,
              }}
            >
              hello@brainmate.ai →
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
