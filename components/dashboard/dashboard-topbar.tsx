'use client'

import Link from 'next/link'
import { Bell, ChevronRight, Search } from 'lucide-react'

const TITLE_BY_PATH: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/bug-explainer': 'DevHelper',
  '/dashboard/homework': 'StudyMate',
  '/dashboard/writing': 'WriteRight',
  '/dashboard/interview': 'InterviewPro',
  '/dashboard/repurposer': 'ContentFlow',
  '/dashboard/account': 'Account',
}

const MODULE_META: Record<string, { color: string; dot: boolean }> = {
  '/dashboard/bug-explainer': { color: 'var(--mod-dev)', dot: true },
  '/dashboard/homework': { color: 'var(--mod-study)', dot: true },
  '/dashboard/writing': { color: 'var(--mod-write)', dot: true },
  '/dashboard/interview': { color: 'var(--mod-interview)', dot: true },
  '/dashboard/repurposer': { color: 'var(--mod-content)', dot: true },
}

function getTitle(pathname: string) {
  return TITLE_BY_PATH[pathname] ?? 'Workspace'
}

export function DashboardTopbar({ pathname }: { pathname: string }) {
  const title = getTitle(pathname)

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-4 transition-colors duration-300 sm:px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-3)]">Workspace</span>
        <ChevronRight size={14} className="text-[var(--text-3)]" />
        <span className="font-medium" style={{ color: MODULE_META[pathname]?.color ?? 'var(--text-1)' }}>
          {MODULE_META[pathname]?.dot && (
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: MODULE_META[pathname].color,
                marginRight: 6,
                verticalAlign: 'middle',
                marginBottom: 1,
              }}
            />
          )}
          {title}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Search"
          className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
        >
          <Search size={16} />
        </button>

        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex size-9 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-1)]"
        >
          <Bell size={16} />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--accent)]" />
        </button>

        <Link
          href="/dashboard/account"
          className="ml-1 inline-flex h-9 items-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-3.5 text-sm font-semibold text-[var(--accent)] no-underline transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"
        >
          Upgrade ↑
        </Link>
      </div>
    </header>
  )
}
