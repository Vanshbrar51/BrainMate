// components/dashboard/writeright/CoachBar.tsx
'use client'
import React, { useState } from 'react'
import type { CoachMetrics } from '@/types/writeright'

interface CoachBarProps {
  metrics: CoachMetrics
  visible: boolean
}

const METRIC_KEYS: Array<{ key: keyof CoachMetrics; label: string }> = [
  { key: 'clarity', label: 'Clarity' },
  { key: 'formality', label: 'Formality' },
  { key: 'conciseness', label: 'Conciseness' },
  { key: 'indianEnglish', label: 'Global' },
  { key: 'passiveVoice', label: 'Active Voice' },
]

export function CoachBar({ metrics, visible }: CoachBarProps) {
  const [tipIdx, setTipIdx] = useState(0)
  if (!visible) return null
  const scoreClass = (v: number) =>
    v >= 75 ? 'coach-good' : v >= 45 ? 'coach-warn' : 'coach-bad'
  const tips = metrics.suggestions ?? []
  return (
    <div className="wr-coach-bar" role="status" aria-live="polite" aria-label="Live writing coach">
      <div className="wr-coach-metrics">
        {METRIC_KEYS.map(({ key, label }) => {
          const val = metrics[key] as number
          return (
            <div key={key} className="wr-coach-metric">
              <span className="wr-coach-metric-label">{label}</span>
              <div className="wr-coach-metric-track">
                <div className={`wr-coach-metric-fill ${scoreClass(val)}`} style={{ width: `${val}%` }} />
              </div>
              <span className={`wr-coach-metric-val ${scoreClass(val)}`}>{val}</span>
            </div>
          )
        })}
      </div>
      {tips.length > 0 && (
        <div className="wr-coach-tip-row">
          <span className="wr-coach-tip-icon">💡</span>
          <span className="wr-coach-tip-text">{tips[tipIdx % tips.length]}</span>
          {tips.length > 1 && (
            <button className="wr-coach-tip-next" onClick={() => setTipIdx(i => (i + 1) % tips.length)} aria-label="Next tip">›</button>
          )}
        </div>
      )}
    </div>
  )
}

export default CoachBar
