'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { SectionLabel } from '@/components/shared/SectionLabel'

export function FAQSection() {
  const faqs = [
    {
      question: 'Is my code and data safe with BrainMate?',
      answer:
        'Yes. BrainMate follows a zero-retention approach for queries. Your code is processed securely, not stored, and never used to train the model.',
    },
    {
      question: 'How is this different from ChatGPT?',
      answer:
        'BrainMate is optimized for explanation, structure, and teaching. The goal is not only to answer quickly, but to make the answer easier to understand and reuse.',
    },
    {
      question: 'Can I use it for competitive programming?',
      answer:
        'Yes. BrainMate can explain optimal algorithms, time and space complexity, and the edge cases that usually make contest problems tricky.',
    },
    {
      question: 'What languages does the Bug Explainer support?',
      answer:
        'It supports more than 40 major languages and common frameworks, including JavaScript, TypeScript, Python, Java, C++, Rust, Go, and SQL.',
    },
    {
      question: 'Can I cancel my subscription anytime?',
      answer:
        'Yes. You can cancel monthly or annual billing from your dashboard and keep access through the end of the active billing period.',
    },
  ]

  return (
    <section className="bg-[color:var(--surface-100)] py-20 lg:py-28" data-section="faq">
      <div className="mx-auto max-w-4xl px-6 lg:px-12">
        <div className="text-center" data-reveal="faq">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="mt-5 text-[36px] font-heading font-semibold tracking-tight text-[color:var(--ink-900)] md:text-[48px] md:leading-[1.02]">
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-7 text-[color:var(--ink-700)] md:text-lg md:leading-8">
            Details on security, product fit, and billing, without the noise.
          </p>
        </div>

        <div
          className="mt-12 rounded-[28px] border border-[color:var(--surface-300)] bg-[color:rgba(255,255,255,0.72)] p-6 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.14)] backdrop-blur-xl md:p-8"
          data-reveal="faq"
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border-b border-[color:var(--surface-200)] last:border-0"
              >
                <AccordionTrigger className="py-5 text-left font-heading text-[18px] font-semibold leading-7 text-[color:var(--ink-800)] hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-7 text-[color:var(--ink-600)]">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
