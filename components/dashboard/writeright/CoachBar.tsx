// components/dashboard/writeright/CoachBar.tsx
// Renders the real-time writing coach metrics and actionable tips.

import React from 'react'
import type { CoachMetrics } from '@/types/writeright'

interface CoachBarProps {
  metrics: CoachMetrics
  visible: boolean
}

export const CoachBar: React.FC<CoachBarProps> = ({ metrics, visible }) => {
  if (!visible) return null

  // Helper to determine score color class
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[var(--wr-success)]'
    if (score >= 50) return 'text-[var(--wr-warning)]'
    return 'text-[var(--wr-error)]'
  }

  // Helper to render score color progress bar background
  const getBarColor = (score: number) => {
    if (score >= 80) return 'bg-[var(--wr-success)]'
    if (score >= 50) return 'bg-[var(--wr-warning)]'
    return 'bg-[var(--wr-error)]'
  }

  return (
    <div className="wr-coach-container flex flex-col gap-3">
      {/* Metrics Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--wr-accent)] bg-[var(--wr-accent-soft)] px-2 py-0.5 rounded-md">
            ✍️ Writing Coach
          </span>
        </div>

        <div className="wr-coach-metrics-row flex flex-wrap gap-5">
          {/* Clarity */}
          <div className="wr-coach-metric-item">
            <span className="wr-coach-metric-label">Clarity</span>
            <div className="flex items-center gap-2">
              <span className={`wr-coach-metric-value ${getScoreColor(metrics.clarity)}`}>
                {metrics.clarity}%
              </span>
              <div className="w-12 h-1.5 bg-[var(--wr-border-soft)] rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getBarColor(metrics.clarity)} transition-all duration-300`} 
                  style={{ width: `${metrics.clarity}%` }}
                />
              </div>
            </div>
          </div>

          {/* Conciseness */}
          <div className="wr-coach-metric-item">
            <span className="wr-coach-metric-label">Conciseness</span>
            <div className="flex items-center gap-2">
              <span className={`wr-coach-metric-value ${getScoreColor(metrics.conciseness)}`}>
                {metrics.conciseness}%
              </span>
              <div className="w-12 h-1.5 bg-[var(--wr-border-soft)] rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getBarColor(metrics.conciseness)} transition-all duration-300`} 
                  style={{ width: `${metrics.conciseness}%` }}
                />
              </div>
            </div>
          </div>

          {/* Formality */}
          <div className="wr-coach-metric-item">
            <span className="wr-coach-metric-label">Formality</span>
            <div className="flex items-center gap-2">
              <span className={`wr-coach-metric-value text-[var(--wr-text)]`}>
                {metrics.formality}%
              </span>
              <div className="w-12 h-1.5 bg-[var(--wr-border-soft)] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[var(--wr-text-2)] transition-all duration-300" 
                  style={{ width: `${metrics.formality}%` }}
                />
              </div>
            </div>
          </div>

          {/* Indian English */}
          <div className="wr-coach-metric-item">
            <span className="wr-coach-metric-label">Global English</span>
            <div className="flex items-center gap-2">
              <span className={`wr-coach-metric-value ${getScoreColor(metrics.indianEnglish)}`}>
                {metrics.indianEnglish}%
              </span>
              <div className="w-12 h-1.5 bg-[var(--wr-border-soft)] rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getBarColor(metrics.indianEnglish)} transition-all duration-300`} 
                  style={{ width: `${metrics.indianEnglish}%` }}
                />
              </div>
            </div>
          </div>

          {/* Passive Voice */}
          <div className="wr-coach-metric-item">
            <span className="wr-coach-metric-label">Active Voice</span>
            <div className="flex items-center gap-2">
              <span className={`wr-coach-metric-value ${getScoreColor(metrics.passiveVoice)}`}>
                {metrics.passiveVoice}%
              </span>
              <div className="w-12 h-1.5 bg-[var(--wr-border-soft)] rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getBarColor(metrics.passiveVoice)} transition-all duration-300`} 
                  style={{ width: `${metrics.passiveVoice}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions block if any exist */}
      {metrics.suggestions && metrics.suggestions.length > 0 && (
        <div className="wr-coach-suggestions flex flex-col gap-1 w-full border-t border-[var(--wr-border-soft)] pt-2 mt-1">
          {metrics.suggestions.map((tip, idx) => (
            <div key={idx} className="wr-coach-suggestion-text flex items-start gap-1.5 text-xs text-[var(--wr-text-2)]">
              <span className="text-[var(--wr-accent)] font-bold">•</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
