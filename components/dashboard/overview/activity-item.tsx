import type { LucideIcon } from 'lucide-react'

type ActivityItemProps = {
  title: string
  meta: string
  status: string
  icon: LucideIcon
  accent: string
}

export function ActivityItem({
  title,
  meta,
  status,
  icon: Icon,
  accent,
}: ActivityItemProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)] sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}14`, border: `1px solid ${accent}33` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-1)]">{title}</p>
          <p className="truncate text-xs text-[var(--text-3)]">{meta}</p>
        </div>
      </div>

      <span className="shrink-0 rounded-full bg-[rgba(45,106,79,0.14)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
        {status}
      </span>
    </div>
  )
}
