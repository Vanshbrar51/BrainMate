'use client'

import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import {
  Code2,
  BookOpen,
  PenLine,
  Mic,
  Repeat2,
  ArrowRight,
  Clock,
  Zap,
  type LucideIcon,
} from 'lucide-react'

type Module = {
  id: string
  name: string
  tagline: string
  href: string
  emoji: string
  icon: LucideIcon
  color: string
  bg: string
  border: string
}

const MODULES: Module[] = [
  {
    id: 'dev',
    name: 'DevHelper',
    tagline: 'Debug & fix code',
    href: '/dashboard/bug-explainer',
    emoji: '🐛',
    icon: Code2,
    color: 'var(--mod-dev)',
    bg: 'var(--mod-dev-bg)',
    border: 'var(--mod-dev-border)',
  },
  {
    id: 'study',
    name: 'StudyMate',
    tagline: 'Learn step by step',
    href: '/dashboard/homework',
    emoji: '📚',
    icon: BookOpen,
    color: 'var(--mod-study)',
    bg: 'var(--mod-study-bg)',
    border: 'var(--mod-study-border)',
  },
  {
    id: 'write',
    name: 'WriteRight',
    tagline: 'Polish your writing',
    href: '/dashboard/writing',
    emoji: '✍️',
    icon: PenLine,
    color: 'var(--mod-write)',
    bg: 'var(--mod-write-bg)',
    border: 'var(--mod-write-border)',
  },
  {
    id: 'interview',
    name: 'InterviewPro',
    tagline: 'Practice interviews',
    href: '/dashboard/interview',
    emoji: '🎤',
    icon: Mic,
    color: 'var(--mod-interview)',
    bg: 'var(--mod-interview-bg)',
    border: 'var(--mod-interview-border)',
  },
  {
    id: 'content',
    name: 'ContentFlow',
    tagline: 'Repurpose content',
    href: '/dashboard/repurposer',
    emoji: '🔁',
    icon: Repeat2,
    color: 'var(--mod-content)',
    bg: 'var(--mod-content-bg)',
    border: 'var(--mod-content-border)',
  },
]

const RECENT = [
  {
    emoji: '🐛',
    mod: 'DevHelper',
    desc: 'Fixed React useState race condition',
    time: '2h ago',
    href: '/dashboard/bug-explainer',
    color: 'var(--mod-dev)',
  },
  {
    emoji: '🎤',
    mod: 'InterviewPro',
    desc: 'Frontend behavioural · Score 82',
    time: 'Yesterday',
    href: '/dashboard/interview',
    color: 'var(--mod-interview)',
  },
  {
    emoji: '✍️',
    mod: 'WriteRight',
    desc: 'Polished project proposal intro',
    time: '2 days ago',
    href: '/dashboard/writing',
    color: 'var(--mod-write)',
  },
  {
    emoji: '📚',
    mod: 'StudyMate',
    desc: 'Integration by parts — full walkthrough',
    time: '3 days ago',
    href: '/dashboard/homework',
    color: 'var(--mod-study)',
  },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardPage() {
  const { user } = useUser()
  const firstName = user?.firstName ?? 'there'

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] transition-colors duration-300">
      <div className="mx-auto max-w-[720px] px-6 pb-20 pt-12 sm:px-8">
        <div className="mb-10">
          <h1
            className="text-[clamp(28px,3.5vw,40px)] leading-tight tracking-[-0.025em] text-[var(--text-1)] [font-family:var(--font-display)]"
            style={{ fontStyle: 'italic' }}
          >
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-2 text-[15px] text-[var(--text-3)]">
            What would you like to work on today?
          </p>
        </div>

        <section className="mb-12">
          <div className="mb-4 flex items-center gap-2">
            <Zap size={13} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
              Your tools
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {MODULES.map((m) => (
              <Link
                key={m.id}
                href={m.href}
                className="group flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 no-underline transition-all hover:border-[var(--border-med)] hover:shadow-[var(--shadow-xs)]"
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border text-[18px]"
                  style={{ background: m.bg, borderColor: m.border }}
                >
                  {m.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[var(--text-1)]">{m.name}</p>
                  <p className="text-[12px] text-[var(--text-3)]">{m.tagline}</p>
                </div>
                <ArrowRight
                  size={15}
                  className="shrink-0 text-[var(--text-3)] opacity-0 transition-opacity group-hover:opacity-100"
                />
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-[var(--text-3)]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
                Recent work
              </span>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {RECENT.map((r, i) => (
              <Link
                key={i}
                href={r.href}
                className="flex items-center gap-3.5 px-4 py-3.5 no-underline transition-colors hover:bg-[var(--bg-subtle)]"
                style={{ borderBottom: i < RECENT.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border text-[14px]"
                  style={{ background: `${r.color}18`, borderColor: `${r.color}30` }}
                >
                  {r.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--text-1)]">{r.mod}</p>
                  <p className="truncate text-[12px] text-[var(--text-3)]">{r.desc}</p>
                </div>
                <span
                  className="shrink-0 text-[11px]"
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}
                >
                  {r.time}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
