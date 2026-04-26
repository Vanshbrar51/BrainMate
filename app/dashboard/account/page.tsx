'use client'

import { useUser } from '@clerk/nextjs'
import { ThemeSelector } from '@/components/ui/ThemeSelector'
import { Moon } from 'lucide-react'

export default function AccountPage() {
  const { user } = useUser()

  const mods = [
    { label: 'DevHelper', emoji: '🐛', n: 42, fill: 'var(--mod-dev)', bg: 'var(--mod-dev-bg)' },
    {
      label: 'StudyMate',
      emoji: '📚',
      n: 28,
      fill: 'var(--mod-study)',
      bg: 'var(--mod-study-bg)',
    },
    {
      label: 'WriteRight',
      emoji: '✍️',
      n: 19,
      fill: 'var(--mod-write)',
      bg: 'var(--mod-write-bg)',
    },
    {
      label: 'InterviewPro',
      emoji: '🎤',
      n: 14,
      fill: 'var(--mod-interview)',
      bg: 'var(--mod-interview-bg)',
    },
    {
      label: 'ContentFlow',
      emoji: '🔁',
      n: 7,
      fill: 'var(--mod-content)',
      bg: 'var(--mod-content-bg)',
    },
  ]
  const total = mods.reduce((s, m) => s + m.n, 0)
  const Q_USED = 3
  const Q_MAX = 10
  const qPct = Math.round((Q_USED / Q_MAX) * 100)

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] transition-colors duration-300">
      <div className="mx-auto max-w-[680px] px-6 pb-20 pt-12 sm:px-8">
        <div className="mb-10 border-b border-[var(--border)] pb-8">
          <h1
            className="text-[clamp(24px,2.8vw,32px)] leading-tight tracking-[-0.025em] text-[var(--text-1)] [font-family:var(--font-display)]"
            style={{ fontStyle: 'italic' }}
          >
            Account
          </h1>
          <p className="mt-1.5 text-[14px] text-[var(--text-3)]">
            Plan, usage, profile, and preferences.
          </p>
        </div>

        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Plan & Usage
          </p>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div className="flex items-center gap-4">
              <span className="pbadge pbadge-free">Free</span>
              <div>
                <p className="text-[14px] font-medium text-[var(--text-1)]">
                  {Q_MAX - Q_USED} of {Q_MAX} queries left today
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="qmeter-track w-40 flex-none">
                    <div className="qmeter-fill" style={{ width: `${qPct}%` }} />
                  </div>
                  <span
                    className="text-[11px] text-[var(--text-3)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {qPct}%
                  </span>
                </div>
              </div>
            </div>
            <a
              href="/pricing"
              className="inline-flex h-9 items-center rounded-xl bg-[var(--accent)] px-4 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-[var(--accent-hover)]"
            >
              Upgrade →
            </a>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <p className="text-[11px] font-medium text-[var(--text-3)]">All-time queries by module</p>
            </div>
            {mods.map((m, i) => (
              <div
                key={m.label}
                className="flex items-center gap-4 px-5 py-3.5"
                style={{ borderBottom: i < mods.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <span className="w-5 shrink-0 text-center text-[15px]">{m.emoji}</span>
                <span className="w-28 shrink-0 text-[13px] font-medium text-[var(--text-2)]">
                  {m.label}
                </span>
                <div className="ubar-track flex-1">
                  <div className="ubar-fill" style={{ width: `${(m.n / total) * 100}%`, background: m.fill }} />
                </div>
                <span
                  className="w-8 shrink-0 text-right text-[13px] font-semibold text-[var(--text-1)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {m.n}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Profile
          </p>
          <div className="flex max-w-[420px] flex-col gap-4">
            {[
              { l: 'Name', v: user?.fullName ?? '—' },
              { l: 'Email', v: user?.primaryEmailAddress?.emailAddress ?? '—' },
            ].map((f) => (
              <div key={f.l}>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-3)]">
                  {f.l}
                </label>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-[13.5px] text-[var(--text-2)]">
                  {f.v}
                </div>
              </div>
            ))}
            <p className="text-[12px] text-[var(--text-3)]">
              To update your profile,{' '}
              <a href="#" className="text-[var(--accent)] no-underline hover:underline">
                visit account settings
              </a>
              .
            </p>
          </div>
        </section>

        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Appearance
          </p>
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
                <Moon size={14} className="text-[var(--text-2)]" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-[var(--text-1)]">Theme</p>
                <p className="text-[11px] text-[var(--text-3)]">Light, dark, or follow system</p>
              </div>
            </div>
            <ThemeSelector />
          </div>
        </section>

        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Preferences
          </p>
          <div className="max-w-[420px]">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-3)]">
              Default module on login
            </label>
            <select className="w-full cursor-pointer appearance-none rounded-xl border border-[var(--border-med)] bg-[var(--surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--text-1)] outline-none transition-colors focus:border-[var(--border-strong)]">
              {['Overview', 'DevHelper', 'StudyMate', 'WriteRight', 'InterviewPro', 'ContentFlow'].map(
                (o) => (
                  <option key={o}>{o}</option>
                )
              )}
            </select>
          </div>
        </section>

        <section>
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Danger zone
          </p>
          <button className="rounded-xl border border-[rgba(192,57,43,0.18)] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[var(--error)] transition-colors hover:bg-[rgba(192,57,43,0.06)]">
            Delete account
          </button>
        </section>
      </div>
    </div>
  )
}
