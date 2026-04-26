import Link from 'next/link'
import { Check, type LucideIcon } from 'lucide-react'

export type ModuleCardData = {
  title: string
  description: string
  audience: string
  icon: LucideIcon
  accent: string
  badgeBg: string
  badgeText: string
  href: string
  points: string[]
}

export function ModuleCard({
  title,
  description,
  audience,
  icon: Icon,
  accent,
  badgeBg,
  badgeText,
  href,
  points,
}: ModuleCardData) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 no-underline shadow-[var(--shadow-xs)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--border-med)] hover:shadow-[var(--shadow-sm)]"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)] transition-colors group-hover:text-[var(--text-1)]">
          <Icon size={18} />
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: badgeBg, color: badgeText }}
        >
          {audience}
        </span>
      </div>

      <h3 className="text-[34px] leading-none text-[var(--text-1)] [font-family:var(--font-display)]">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">{description}</p>

      <ul className="mt-5 space-y-2.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm text-[var(--text-2)]">
            <Check size={15} className="mt-0.5 shrink-0" style={{ color: accent }} />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </Link>
  )
}
