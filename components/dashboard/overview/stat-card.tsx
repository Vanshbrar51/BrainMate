import type { LucideIcon } from 'lucide-react'

type StatCardProps = {
  label: string
  value: string
  note: string
  noteColor?: string
  icon?: LucideIcon
}

export function StatCard({
  label,
  value,
  note,
  noteColor = 'var(--text-3)',
  icon: Icon,
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-xs)] sm:p-5">
      <p className="text-[11px] font-semibold tracking-[0.1em] text-[var(--text-3)] uppercase">
        {label}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[34px] leading-none [font-family:var(--font-display)]">{value}</p>
        {Icon ? (
          <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-2)]">
            <Icon size={15} />
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-medium" style={{ color: noteColor }}>
        {note}
      </p>
    </div>
  )
}
