'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import {
  Home,
  Layers3,
  MessageCircleMore,
  Library,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeSelector } from '@/components/ui/ThemeSelector'

type PrimaryItem = {
  label: string
  icon: LucideIcon
  href?: string
}

type ModuleItem = {
  label: string
  href: string
  color: string
}

const PRIMARY_ITEMS: PrimaryItem[] = [
  { label: 'Dashboard', icon: Home, href: '/dashboard' },
  { label: 'Recent Chats', icon: MessageCircleMore },
  { label: 'Knowledge Base', icon: Library },
]

const MODULE_ITEMS: ModuleItem[] = [
  { label: 'DevHelper', href: '/dashboard/bug-explainer', color: 'var(--mod-dev)' },
  { label: 'StudyMate', href: '/dashboard/homework', color: 'var(--mod-study)' },
  { label: 'WriteRight', href: '/dashboard/writing', color: 'var(--mod-write)' },
  { label: 'InterviewPro', href: '/dashboard/interview', color: 'var(--mod-interview)' },
  { label: 'ContentFlow', href: '/dashboard/repurposer', color: 'var(--mod-content)' },
]

function PrimaryNavItem({
  item,
  active,
}: {
  item: PrimaryItem
  active: boolean
}) {
  const content = (
    <>
      <item.icon size={16} strokeWidth={active ? 2.2 : 1.9} />
      <span>{item.label}</span>
    </>
  )

  const className = cn(
    'flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors',
    active
      ? 'bg-[var(--surface)] text-[var(--text-1)] shadow-[var(--shadow-xs)]'
      : 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text-1)]',
    !item.href && 'cursor-default opacity-85'
  )

  if (!item.href) {
    return (
      <div aria-disabled className={className}>
        {content}
      </div>
    )
  }

  return (
    <Link href={item.href} className={className}>
      {content}
    </Link>
  )
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { user } = useUser()

  const fullName = user?.fullName ?? 'Alex Researcher'
  const initials = user?.firstName?.[0] ?? fullName[0] ?? 'A'

  return (
    <aside className="hidden h-screen w-[250px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-subtle)] transition-colors duration-300 lg:flex">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <Link href="/" className="flex items-center gap-2.5 text-[var(--text-1)] no-underline">
          <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-med)] bg-[var(--surface)]">
            <Layers3 size={16} strokeWidth={1.9} />
          </div>
          <span className="text-[28px] leading-none [font-family:var(--font-display)]">BrainMate</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {PRIMARY_ITEMS.map((item) => {
          const active = item.href ? pathname === item.href : false
          return <PrimaryNavItem key={item.label} item={item} active={active} />
        })}

        <div className="mt-5 px-2 pb-2 pt-4 text-[11px] font-semibold tracking-[0.12em] text-[var(--text-3)] uppercase">
          Modules
        </div>

        <div className="space-y-0.5 px-1">
          {MODULE_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-xl px-3 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text-1)]',
                  active && 'bg-[var(--surface)] text-[var(--text-1)] shadow-[var(--shadow-xs)]'
                )}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: item.color }}
                />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-4">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-[var(--text-3)] uppercase">
            Appearance
          </span>
          <ThemeSelector />
        </div>

        <Link
          href="/dashboard/account"
          className="mb-2 flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text-1)]"
        >
          <Settings2 size={15} />
          <span>Settings</span>
        </Link>

        <Link
          href="/dashboard/account"
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 no-underline transition-colors hover:border-[var(--border-med)]"
        >
          <div className="flex size-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] text-xs font-medium text-[var(--text-2)]">
            {initials.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--text-1)]">{fullName}</p>
            <p className="text-xs text-[var(--text-3)]">Pro Plan</p>
          </div>
        </Link>
      </div>
    </aside>
  )
}
