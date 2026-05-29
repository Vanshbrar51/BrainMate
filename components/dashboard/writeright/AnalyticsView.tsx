// components/dashboard/writeright/AnalyticsView.tsx
// Full-page analytics overlay — production-grade, AI-powered Writing DNA.
// Tokens: --bg-canvas, --bg-surface, --bg-raised, --border-soft, --text-1/2/3, --accent, --ink
// Layout: header bar → KPI row → heatmap → trends line chart → distributions → weekly bars → DNA + insights
// v2: AI Coach panel, Strength/Growth cards, dynamic coach message from Gemini

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  X, TrendingUp, TrendingDown, Minus, Zap, FileText, Target, Flame,
  ChevronRight, Calendar, Star, AlertCircle, MessageSquare, Award,
  BarChart2, Sparkles, CheckCircle2
} from 'lucide-react'
import type { AnalyticsData } from '@/types/writeright'

type DateRange = '30d' | '90d' | 'all'

interface AnalyticsViewProps {
  isOpen: boolean
  onClose: () => void
}

// ─── Shimmer loading skeleton ─────────────────────────────────────────────────
function Shimmer({ width = '100%', height = 20, radius = 6 }: { width?: string | number; height?: number; radius?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, var(--bg-raised) 25%, rgba(26,23,19,0.06) 50%, var(--bg-raised) 75%)',
        backgroundSize: '200% 100%',
        animation: 'wr-shimmer 1.4s ease infinite',
        flexShrink: 0,
      }}
    />
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = false,
  trend,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent?: boolean
  trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${accent ? 'rgba(196,98,45,0.2)' : 'var(--border-soft)'}`,
        borderRadius: 14,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        flex: '1 1 180px',
        minWidth: 0,
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{
          width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: accent ? 'rgba(196,98,45,0.1)' : 'var(--bg-raised)',
          color: accent ? 'var(--accent)' : 'var(--text-2)',
        }}>
          {icon}
        </span>
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'ui-monospace, monospace', lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            {trend === 'up' && <TrendingUp size={10} color="#16A34A" />}
            {trend === 'down' && <TrendingDown size={10} color="#DC2626" />}
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Horizontal bar chart (mode/tone distribution) ────────────────────────────
function BarChart({
  items,
  colorKey,
}: {
  items: Array<{ label: string; count: number; percent: number }>
  colorKey: 'accent' | 'ink'
}) {
  const barColor = colorKey === 'accent' ? 'var(--accent)' : 'var(--ink)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(({ label, count, percent }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, textTransform: 'capitalize' }}>{label}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'ui-monospace, monospace' }}>
              {count} &middot; {percent}%
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-raised)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 999,
                background: barColor,
                width: `${percent}%`,
                transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Daily activity bar chart ────────────────────────────────────────────────
function DailyBars({ days }: { days: Array<{ date_label: string; count: number }> }) {
  const maxCount = Math.max(...days.map(d => d.count), 1)
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80, width: '100%', overflowX: 'auto', paddingBottom: 4 }}>
      {days.map(({ date_label, count }) => {
        const heightPct = Math.max(4, (count / maxCount) * 100)
        return (
          <div
            key={date_label}
            title={`${date_label}: ${count} improvements`}
            style={{
              flex: '1 0 14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              cursor: 'default',
            }}
          >
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  borderRadius: '3px 3px 1px 1px',
                  background: count > 0 ? 'var(--accent)' : 'var(--bg-raised)',
                  opacity: count > 0 ? 0.85 : 1,
                  transition: 'height 0.5s cubic-bezier(0.16,1,0.3,1)',
                }}
              />
            </div>
            <span style={{ fontSize: 8.5, color: 'var(--text-3)', whiteSpace: 'nowrap', letterSpacing: 0, transform: 'rotate(-45deg)', marginTop: 8 }}>
              {date_label.split(' ')[0]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── SVG Score Trend Line Chart ───────────────────────────────────────────────
function TrendChart({ trends }: { trends: AnalyticsData['score_trends'] }) {
  const [hovered, setHovered] = useState<{ label: string; value: number; date: string; x: number; y: number } | null>(null)
  if (trends.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No score data yet — write more to see trends.</span>
      </div>
    )
  }

  const W = 500, H = 160, PX = 30, PY = 16
  const cW = W - PX * 2, cH = H - PY * 2
  const n = trends.length

  const coord = (i: number, score: number) => ({
    x: PX + (i / Math.max(n - 1, 1)) * cW,
    y: PY + cH - (score / 10) * cH,
  })

  const path = (key: 'clarity' | 'tone' | 'impact') => {
    return trends.map((pt, i) => {
      const { x, y } = coord(i, pt[key])
      if (i === 0) return `M${x},${y}`
      const prev = coord(i - 1, trends[i - 1][key])
      const cpx = prev.x + (x - prev.x) / 2
      return `C${cpx},${prev.y} ${cpx},${y} ${x},${y}`
    }).join(' ')
  }

  const lines = [
    { key: 'clarity' as const, color: '#16A34A', label: 'Clarity' },
    { key: 'tone' as const, color: '#2563EB', label: 'Tone' },
    { key: 'impact' as const, color: '#D97706', label: 'Impact' },
  ]

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', userSelect: 'none', display: 'block' }}>
        {/* Grid lines */}
        {[0, 2.5, 5, 7.5, 10].map(v => {
          const y = PY + cH - (v / 10) * cH
          return (
            <g key={v}>
              <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="var(--border-soft)" strokeWidth={1} strokeDasharray="4 4" />
              <text x={PX - 4} y={y + 3} fontSize={8} fill="var(--text-3)" textAnchor="end">{v}</text>
            </g>
          )
        })}
        {/* Lines */}
        {lines.map(({ key, color }) => (
          <path key={key} d={path(key)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* Dots */}
        {trends.map((pt, i) =>
          lines.map(({ key, color, label }) => {
            const { x, y } = coord(i, pt[key])
            return (
              <circle
                key={`${key}-${i}`}
                cx={x} cy={y} r={3}
                fill={color}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  const rect = (e.target as SVGCircleElement).getBoundingClientRect()
                  setHovered({ label, value: pt[key], date: pt.date, x: rect.left + window.scrollX, y: rect.top + window.scrollY - 38 })
                }}
                onMouseLeave={() => setHovered(null)}
              />
            )
          })
        )}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 12 }}>
        {lines.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: color }} />
            {label}
          </div>
        ))}
      </div>
      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'fixed',
            left: hovered.x,
            top: hovered.y,
            background: 'var(--text-1)',
            color: 'var(--bg-canvas)',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 11.5,
            fontWeight: 500,
            pointerEvents: 'none',
            zIndex: 200,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(26,23,19,0.15)',
          }}
        >
          {hovered.label}: {hovered.value}/10 · {hovered.date}
        </div>
      )}
    </div>
  )
}

// ─── GitHub-style Heatmap ─────────────────────────────────────────────────────
function Heatmap({ heatmap }: { heatmap: AnalyticsData['heatmap'] }) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null)
  const counts: Record<string, number> = {}
  heatmap.forEach(h => { counts[h.date] = h.count })

  const CELL = 11, GAP = 2, WEEKS = 52, DAYS = 7
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - (WEEKS * DAYS) + 1)

  const color = (count: number) => {
    if (!count) return 'var(--bg-raised)'
    if (count === 1) return 'rgba(196,98,45,0.25)'
    if (count === 2) return 'rgba(196,98,45,0.50)'
    if (count <= 4) return 'rgba(196,98,45,0.75)'
    return 'var(--accent)'
  }

  const monthLabels: Array<{ label: string; x: number }> = []
  let lastMonth = -1
  for (let w = 0; w < WEEKS; w++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + w * 7)
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth()
      monthLabels.push({
        label: d.toLocaleDateString('en-IN', { month: 'short' }),
        x: w * (CELL + GAP) + 26,
      })
    }
  }

  const svgWidth = WEEKS * (CELL + GAP) + 30
  const svgHeight = DAYS * (CELL + GAP) + 28

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <svg width={svgWidth} height={svgHeight} style={{ userSelect: 'none', display: 'block' }}>
        {['M', 'W', 'F'].map((d, i) => (
          <text key={d} x={4} y={20 + i * 2 * (CELL + GAP) + (CELL + GAP)} fontSize={8} fill="var(--text-3)" dominantBaseline="middle">{d}</text>
        ))}
        {monthLabels.map(({ label, x }) => (
          <text key={`${label}-${x}`} x={x} y={12} fontSize={8} fill="var(--text-3)">{label}</text>
        ))}
        {Array.from({ length: WEEKS }, (_, w) =>
          Array.from({ length: DAYS }, (_, d) => {
            const cur = new Date(startDate)
            cur.setDate(startDate.getDate() + w * 7 + d)
            const dateStr = cur.toISOString().split('T')[0]
            const count = counts[dateStr] ?? 0
            const x = w * (CELL + GAP) + 26
            const y = d * (CELL + GAP) + 18
            return (
              <rect
                key={`${w}-${d}`}
                x={x} y={y}
                width={CELL} height={CELL}
                rx={2} ry={2}
                fill={color(count)}
                style={{ cursor: 'pointer', transition: 'fill 0.12s ease' }}
                onMouseEnter={e => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect()
                  setTooltip({
                    date: cur.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                    count,
                    x: rect.left + window.scrollX,
                    y: rect.top + window.scrollY - 36,
                  })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })
        )}
      </svg>
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            background: 'var(--text-1)',
            color: 'var(--bg-canvas)',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 11.5,
            fontWeight: 500,
            pointerEvents: 'none',
            zIndex: 200,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(26,23,19,0.15)',
          }}
        >
          {tooltip.count > 0 ? `${tooltip.count} improvement${tooltip.count > 1 ? 's' : ''}` : 'No activity'} · {tooltip.date}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Less</span>
        {[0, 1, 2, 3, 4].map(v => (
          <div key={v} style={{ width: CELL, height: CELL, borderRadius: 2, background: color(v) }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>More</span>
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 14,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {title}
        </span>
        {badge}
      </div>
      {children}
    </div>
  )
}

// ─── AI Badge ────────────────────────────────────────────────────────────────
function AiBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
      padding: '2px 8px', borderRadius: 20,
      background: 'rgba(196,98,45,0.08)',
      color: 'var(--accent)',
      border: '1px solid rgba(196,98,45,0.18)',
    }}>
      <Sparkles size={9} />
      AI
    </span>
  )
}

// ─── AI Coach Panel ───────────────────────────────────────────────────────────
function CoachPanel({ data }: { data: AnalyticsData }) {
  const { writing_dna } = data
  const hasAiData = !!(writing_dna.strength || writing_dna.growth_area || writing_dna.coach_message)

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(196,98,45,0.05) 0%, rgba(196,98,45,0.02) 100%)',
        border: '1px solid rgba(196,98,45,0.18)',
        borderRadius: 16,
        padding: '22px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(196,98,45,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)',
          }}>
            <MessageSquare size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Your Writing Coach</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Personalised feedback powered by Gemini</div>
          </div>
        </div>
        {hasAiData && <AiBadge />}
      </div>

      {/* Coach message */}
      {writing_dna.coach_message ? (
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 12,
          padding: '14px 16px',
          border: '1px solid var(--border-soft)',
        }}>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>
            &ldquo;{writing_dna.coach_message}&rdquo;
          </p>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-surface)',
          borderRadius: 12,
          padding: '14px 16px',
          border: '1px solid var(--border-soft)',
        }}>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.65, margin: 0 }}>
            Complete more writing sessions to unlock your personalised weekly coaching message.
          </p>
        </div>
      )}

      {/* Strength + Growth area side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {/* Strength */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(22,163,74,0.06)',
          border: '1px solid rgba(22,163,74,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Star size={13} color="#16A34A" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your Strength
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
            {writing_dna.strength ?? 'Keep writing to reveal your signature communication strength.'}
          </p>
        </div>

        {/* Growth area */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(217,119,6,0.06)',
          border: '1px solid rgba(217,119,6,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} color="#D97706" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Growth Focus
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
            {writing_dna.growth_area ?? 'Your growth opportunities will appear after a few more sessions.'}
          </p>
        </div>
      </div>

      {/* Top Mistake Fixed */}
      {writing_dna.top_mistake_fixed && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: 'rgba(37,99,235,0.05)',
          border: '1px solid rgba(37,99,235,0.14)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <CheckCircle2 size={14} color="#2563EB" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Recent Win
            </span>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, margin: '4px 0 0' }}>
              {writing_dna.top_mistake_fixed}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main AnalyticsView ───────────────────────────────────────────────────────
export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<DateRange>('30d')
  const [error, setError] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const fetchAnalytics = useCallback(async (r: DateRange) => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/writeright/analytics?range=${r}`)
      if (res.ok) setData(await res.json())
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    fetchAnalytics(range)
  }, [isOpen, range, fetchAnalytics])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const trajectoryIcon = data?.writing_dna.improvement_trajectory === 'improving'
    ? <TrendingUp size={14} color="#16A34A" />
    : data?.writing_dna.improvement_trajectory === 'declining'
      ? <TrendingDown size={14} color="#DC2626" />
      : <Minus size={14} color="var(--text-3)" />

  // Compute week-over-week trend labels
  const wordsTrend = data
    ? data.weekly_report.this_week_words >= data.weekly_report.last_week_words ? 'up' : 'down'
    : undefined

  return (
    <div
      className="wr-analytics-overlay open"
      role="dialog"
      aria-modal="true"
      aria-label="Writing Analytics"
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 1100,
          width: '100%',
          margin: '0 auto 28px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-instrument-serif, Georgia, serif)',
              fontSize: 'clamp(22px,3vw,32px)',
              fontWeight: 400,
              color: 'var(--text-1)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Writing Analytics
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '4px 0 0' }}>
            AI-powered insights into your writing patterns and progress
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Range switcher */}
          <div
            style={{
              display: 'flex',
              border: '1px solid var(--border-soft)',
              borderRadius: 20,
              overflow: 'hidden',
              background: 'var(--bg-surface)',
            }}
          >
            {(['30d', '90d', 'all'] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  height: 30,
                  padding: '0 14px',
                  border: 'none',
                  borderRadius: 0,
                  background: range === r ? 'var(--ink)' : 'transparent',
                  color: range === r ? '#fff' : 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
                aria-pressed={range === r}
              >
                {r === 'all' ? 'All time' : r === '30d' ? '30 days' : '90 days'}
              </button>
            ))}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close analytics"
            style={{
              width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border-soft)',
              background: 'transparent', color: 'var(--text-2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {loading ? (
          /* Skeleton */
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ flex: '1 1 180px', background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Shimmer height={12} width="60%" />
                  <Shimmer height={30} width="50%" />
                </div>
              ))}
            </div>
            {/* Coach panel skeleton */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 16, padding: 26 }}>
              <Shimmer height={14} width="30%" />
              <div style={{ marginTop: 16 }}><Shimmer height={60} /></div>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Shimmer height={60} />
                <Shimmer height={60} />
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 14, padding: 24 }}>
              <Shimmer height={12} width="30%" />
              <div style={{ marginTop: 16 }}><Shimmer height={100} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20 }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 14, padding: 24 }}>
                <Shimmer height={12} width="40%" />
                <div style={{ marginTop: 16 }}><Shimmer height={160} /></div>
              </div>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 14, padding: 24 }}>
                <Shimmer height={12} width="40%" />
                <div style={{ marginTop: 16 }}><Shimmer height={160} /></div>
              </div>
            </div>
          </>
        ) : error || !data ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '80px 24px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
              <Target size={24} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>No analytics data yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Start writing with WriteRight to see your progress here.</div>
            </div>
          </div>
        ) : (
          <>
            {/* ── KPI Row ────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <KpiCard
                label="Improvements"
                value={data.total_improvements}
                sub={`${data.streak.total_days} active days`}
                icon={<Zap size={15} />}
                accent
              />
              <KpiCard
                label="Words Improved"
                value={data.total_words_improved.toLocaleString()}
                sub={data.weekly_report.this_week_words > 0 ? `+${data.weekly_report.this_week_words.toLocaleString()} this week` : 'total output'}
                icon={<FileText size={15} />}
                trend={wordsTrend}
              />
              <KpiCard
                label="Avg Clarity"
                value={data.avg_scores.clarity > 0 ? `${data.avg_scores.clarity}/10` : '—'}
                sub={`Tone ${data.avg_scores.tone > 0 ? data.avg_scores.tone : '—'} · Impact ${data.avg_scores.impact > 0 ? data.avg_scores.impact : '—'}`}
                icon={<Target size={15} />}
              />
              <KpiCard
                label="Current Streak"
                value={`${data.streak.current}d`}
                sub={`Best: ${data.streak.longest} days`}
                icon={<Flame size={15} />}
                accent={data.streak.current > 0}
              />
            </div>

            {/* ── AI Coach Panel ─────────────────────────────────────────── */}
            <CoachPanel data={data} />

            {/* ── Activity Heatmap ───────────────────────────────────────── */}
            <Section title="Writing Frequency — Last 12 Months">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, overflowX: 'auto' }}>
                  <Heatmap heatmap={data.heatmap} />
                </div>
                <button
                  onClick={() => setReportOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 28,
                    padding: '0 10px',
                    marginLeft: 16,
                    border: '1px solid var(--border-soft)',
                    borderRadius: 20,
                    background: 'var(--bg-surface)',
                    color: 'var(--text-2)',
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <Calendar size={13} />
                  Weekly Report
                </button>
              </div>
            </Section>

            {/* ── Charts row ─────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20 }}>
              <Section title={`AI Score Trends — ${range === 'all' ? 'All time' : range === '30d' ? 'Last 30 days' : 'Last 90 days'}`}>
                <TrendChart trends={data.score_trends} />
              </Section>

              <Section title="Daily Activity (Last 14 Days)">
                {data.daily_activity.length > 0
                  ? <DailyBars days={data.daily_activity} />
                  : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No daily data yet.</span>
                }
              </Section>
            </div>

            {/* ── Distribution row ───────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
              <Section title="Mode Usage" badge={<BarChart2 size={13} color="var(--text-3)" />}>
                {data.mode_distribution.length > 0
                  ? <BarChart items={data.mode_distribution.map(m => ({ label: m.mode, count: m.count, percent: m.percent }))} colorKey="accent" />
                  : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No mode data yet.</span>
                }
              </Section>
              <Section title="Tone Distribution" badge={<BarChart2 size={13} color="var(--text-3)" />}>
                {data.tone_distribution.length > 0
                  ? <BarChart items={data.tone_distribution.map(t => ({ label: t.tone, count: t.count, percent: t.percent }))} colorKey="ink" />
                  : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No tone data yet.</span>
                }
              </Section>
              <Section title="Top Friction Areas">
                {data.vocabulary_stats.top_mistakes.length > 0
                  ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data.vocabulary_stats.top_mistakes.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: 'var(--bg-raised)',
                            fontSize: 12.5,
                          }}
                        >
                          <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={item.mistake}>
                            {idx + 1}. {item.mistake}
                          </span>
                          <span style={{ fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,0.09)', padding: '2px 8px', borderRadius: 6, fontSize: 11, flexShrink: 0 }}>
                            {item.count}×
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                  : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No friction patterns detected yet.</span>
                }
              </Section>
            </div>

            {/* ── Writing DNA + Insights ─────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 20 }}>
              <Section title="Your Writing DNA" badge={<AiBadge />}>
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(196,98,45,0.09)', color: 'var(--accent)', borderRadius: 20, fontWeight: 600 }}>
                      {data.writing_dna.dominant_tone}
                    </span>
                    <span style={{ fontSize: 11, padding: '3px 10px', background: 'var(--bg-raised)', color: 'var(--text-2)', borderRadius: 20, fontWeight: 600, textTransform: 'capitalize' }}>
                      {data.writing_dna.dominant_mode}
                    </span>
                    <span style={{ fontSize: 11, padding: '3px 10px', border: '1px solid var(--border-soft)', color: 'var(--text-3)', borderRadius: 20, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {trajectoryIcon}
                      {data.writing_dna.improvement_trajectory}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 16px', fontStyle: 'italic' }}>
                    &ldquo;{data.writing_dna.style_summary}&rdquo;
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {data.writing_dna.signature_phrases.map((phrase, i) => (
                      <span key={i} style={{ fontSize: 11.5, padding: '3px 10px', border: '1px solid var(--border-soft)', color: 'var(--text-2)', borderRadius: 6, fontWeight: 500, background: 'var(--bg-raised)' }}>
                        &ldquo;{phrase}&rdquo;
                      </span>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>Global Platform Percentile</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                        <Award size={12} style={{ display: 'inline', marginRight: 4, color: 'var(--accent)', verticalAlign: 'middle' }} />
                        {data.writing_dna.percentile}th
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-raised)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'var(--accent)', width: `${data.writing_dna.percentile}%`, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
                      You outrank {data.writing_dna.percentile}% of all WriteRight users globally.
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="AI Insights" badge={<AiBadge />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.insights.map((insight, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: i === 0 ? 'rgba(196,98,45,0.06)' : 'var(--bg-raised)',
                        border: i === 0 ? '1px solid rgba(196,98,45,0.15)' : '1px solid transparent',
                      }}
                    >
                      <ChevronRight size={14} style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-3)', marginTop: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{insight}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
                      <span>Vocab richness estimate</span>
                      <span style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--text-2)', fontWeight: 600 }}>
                        {data.vocabulary_stats.unique_words_used.toLocaleString()} unique words
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                      <span>Avg sentence length</span>
                      <span style={{ fontFamily: 'ui-monospace,monospace', color: 'var(--text-2)', fontWeight: 600 }}>
                        {data.vocabulary_stats.avg_sentence_length} words
                      </span>
                    </div>
                  </div>
                </div>
              </Section>
            </div>
          </>
        )}
      </div>

      {/* ── Weekly Report Modal ────────────────────────────────────────────── */}
      {reportOpen && data && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(26,23,19,0.4)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            animation: 'fade-in 0.15s ease',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setReportOpen(false) }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-medium)',
              borderRadius: 16,
              width: '100%',
              maxWidth: 420,
              padding: 24,
              boxShadow: '0 8px 32px rgba(26,23,19,0.18)',
              animation: 'scale-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setReportOpen(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
            >
              <X size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(196,98,45,0.09)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Weekly Report</h2>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>This week vs last week</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Words Improved */}
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border-soft)', background: 'var(--bg-raised)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Words Improved</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'ui-monospace, monospace' }}>{data.weekly_report.this_week_words.toLocaleString()}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>vs {data.weekly_report.last_week_words.toLocaleString()}</span>
                  {data.weekly_report.this_week_words >= data.weekly_report.last_week_words
                    ? <TrendingUp size={14} color="#16A34A" style={{ marginBottom: 4 }} />
                    : <TrendingDown size={14} color="#DC2626" style={{ marginBottom: 4 }} />
                  }
                </div>
              </div>

              {/* Improvements Run */}
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border-soft)', background: 'var(--bg-raised)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Improvements Run</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'ui-monospace, monospace' }}>{data.weekly_report.this_week_improvements}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>vs {data.weekly_report.last_week_improvements}</span>
                  {data.weekly_report.this_week_improvements >= data.weekly_report.last_week_improvements
                    ? <TrendingUp size={14} color="#16A34A" style={{ marginBottom: 4 }} />
                    : <TrendingDown size={14} color="#DC2626" style={{ marginBottom: 4 }} />
                  }
                </div>
              </div>

              {/* Average Clarity */}
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border-soft)', background: 'var(--bg-raised)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Average Clarity</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'ui-monospace, monospace' }}>{data.weekly_report.this_week_clarity || '—'}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>vs {data.weekly_report.last_week_clarity || '—'}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setReportOpen(false)}
              className="btn-primary"
              style={{ width: '100%', marginTop: 20, justifyContent: 'center' }}
            >
              Close Report
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnalyticsView
