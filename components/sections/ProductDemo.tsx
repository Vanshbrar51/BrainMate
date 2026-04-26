'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Code2, LayoutTemplate, Mic, PenTool } from 'lucide-react'

const modules = [
  {
    id: 'devhelper',
    label: 'DevHelper',
    icon: Code2,
    message: 'Can you help me understand why this React component is re-rendering infinitely?',
    response:
      'I see the issue. You have an effect dependency array that updates on every render. Because the array contains an object reference that is recreated on each cycle, React assumes the dependency has changed.',
  },
  {
    id: 'studymate',
    label: 'StudyMate',
    icon: BookOpen,
    message: "Explain quantum entanglement like I'm 10 years old.",
    response:
      'Imagine you have two magic coins. When you flip one and it lands on heads, the other one instantly lands on heads too, even if it is all the way on Mars. They stay perfectly connected.',
  },
  {
    id: 'writeright',
    label: 'WriteRight',
    icon: PenTool,
    message: 'Help me rewrite this awkward email to my professor.',
    response:
      'Here is a more polished and professional version of your email. I softened the tone while keeping your request clear and respectful.',
  },
  {
    id: 'interviewpro',
    label: 'InterviewPro',
    icon: Mic,
    message: "I have a system design interview tomorrow. Let's practice caching strategies.",
    response:
      'Great. Let us start with a distributed caching scenario. How would you handle cache invalidation when user profiles are updated across multiple regions?',
  },
  {
    id: 'contentflow',
    label: 'ContentFlow',
    icon: LayoutTemplate,
    message: 'I need a content calendar for my tech blog this month.',
    response:
      'I drafted a four-week calendar covering AI in coding, framework comparisons, and deep-dive tutorials. We can tune the pace or audience next.',
  },
]

export default function ProductDemo() {
  const [activeTab, setActiveTab] = useState(modules[0].id)
  const activeModule = modules.find((module) => module.id === activeTab) ?? modules[0]

  return (
    <section id="product-demo" className="relative overflow-hidden bg-[var(--surface-2)] py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-24 h-[320px] w-[760px] -translate-x-1/2 rounded-full bg-[var(--accent)] opacity-[0.035] blur-[140px]" />
      </div>

      <div className="container relative z-10 max-w-[1120px]">
        <div className="mx-auto mb-[3.5rem] max-w-[720px] text-center md:mb-16">
          <h2
            className="reveal text-[34px] font-medium tracking-[-0.04em] text-[var(--text-1)] md:text-[46px]"
            style={{ fontFamily: 'var(--font-display)', lineHeight: 1.02 }}
          >
            One interface, tuned for calm, focused work.
          </h2>
          <p className="reveal mx-auto mt-4 max-w-[620px] text-[15px] leading-7 text-[var(--text-2)] md:text-[18px] md:leading-8">
            Switch between BrainMate modules without leaving a single clear workspace. The preview stays light, quiet, and easy to scan.
          </p>
        </div>

        <div className="reveal mb-8 flex justify-center md:mb-10">
          <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-[color:rgba(255,255,255,0.58)] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {modules.map((module) => {
              const Icon = module.icon
              const isActive = activeTab === module.id

              return (
                <button
                  key={module.id}
                  onClick={() => setActiveTab(module.id)}
                  className="relative shrink-0 rounded-full px-4 py-2 text-[13px] font-medium tracking-[-0.01em] text-[var(--text-3)] transition-colors duration-300 outline-none md:px-[1.125rem]"
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-demo-tab"
                      className="absolute inset-0 rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    />
                  )}
                  <span className={`relative z-10 flex items-center gap-2 ${isActive ? 'text-[var(--text-1)]' : 'hover:text-[var(--text-2)]'}`}>
                    <Icon size={15} strokeWidth={isActive ? 1.9 : 1.6} />
                    {module.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="reveal mx-auto max-w-[920px] overflow-hidden rounded-[28px] border border-[var(--border)] bg-[color:rgba(255,255,255,0.64)] shadow-[0_20px_50px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex h-[3.25rem] items-center border-b border-[var(--border)] bg-[color:rgba(255,255,255,0.38)] px-5 md:px-6">
            <div className="flex gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--chrome-red)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--chrome-yellow)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--chrome-green)]" />
            </div>
            <div className="mx-auto text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-3)]">
              {activeModule.label}
            </div>
            <div className="w-10" />
          </div>

          <div className="grid gap-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="border-b border-[var(--border)] bg-[color:rgba(255,255,255,0.32)] p-5 md:border-b-0 md:border-r md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-3)]">
                  Prompt
                </span>
                <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-2)]">
                  Live preview
                </span>
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeModule.id}-prompt`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 text-[14px] leading-7 text-[var(--text-1)] shadow-[0_1px_2px_rgba(0,0,0,0.03)] md:p-5"
                >
                  {activeModule.message}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <activeModule.icon size={14} strokeWidth={1.9} className="text-[var(--text-1)]" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-1)]">BrainMate</p>
                  <p className="text-[12px] text-[var(--text-3)]">Explaining the next step</p>
                </div>
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeModule.id}-response`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  <div className="text-[14px] leading-7 text-[var(--text-2)] md:text-[15px] md:leading-8">
                    {activeModule.response}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                    Thinking through context and intent
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
