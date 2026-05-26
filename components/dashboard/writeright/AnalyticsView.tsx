// components/dashboard/writeright/AnalyticsView.tsx
// Full-screen overlay providing detailed writing history deep analytics, 
// including an SVG heatmap and score trends line chart built entirely from scratch.

import React, { useState, useEffect } from 'react'
import type { AnalyticsData } from '@/types/writeright'

interface AnalyticsViewProps {
  isOpen: boolean
  onClose: () => void
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredCell, setHoveredCell] = useState<{ date: string; count: number; x: number; y: number } | null>(null)
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; value: number; label: string; x: number; y: number } | null>(null)

  // 1. Fetch Analytics data
  useEffect(() => {
    if (!isOpen) return

    async function fetchAnalytics() {
      setLoading(true)
      try {
        const res = await fetch('/api/writeright/analytics')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (err) {
        console.error('Failed to load writing analytics:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [isOpen])

  // 2. Keyboard shortcut Escape to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // ---------------------------------------------------------------------------
  // Heatmap rendering logic (52 weeks x 7 days)
  // ---------------------------------------------------------------------------
  const renderHeatmap = () => {
    if (!data) return null

    // Build map for quick lookups
    const counts: Record<string, number> = {}
    data.heatmap.forEach(h => {
      counts[h.date] = h.count
    })

    const cellSize = 10
    const cellGap = 3
    const weeksCount = 53
    const daysCount = 7

    const cells: React.ReactNode[] = []
    
    // Generate dates for the last 52 weeks (starting from 364 days ago)
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - (weeksCount * daysCount) + 1)

    // Helper to get color for cell
    const getCellColor = (count: number) => {
      if (!count) return 'var(--wr-surface-2)'
      if (count === 1) return 'var(--wr-accent-soft)'
      if (count === 2) return 'rgba(217,119,87,0.45)'
      if (count <= 4) return 'var(--wr-accent)'
      return 'var(--wr-accent-hover)' // max activity
    }

    for (let w = 0; w < weeksCount; w++) {
      for (let d = 0; d < daysCount; d++) {
        const currentDate = new Date(startDate)
        currentDate.setDate(startDate.getDate() + (w * 7) + d)
        
        const dateStr = currentDate.toISOString().split('T')[0]
        const count = counts[dateStr] || 0
        
        const x = w * (cellSize + cellGap) + 30
        const y = d * (cellSize + cellGap) + 20

        cells.push(
          <rect
            key={`${w}-${d}`}
            x={x}
            y={y}
            width={cellSize}
            height={cellSize}
            fill={getCellColor(count)}
            className="wr-analytics-heatmap-cell cursor-pointer"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHoveredCell({
                date: currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                count,
                x: rect.left + window.scrollX - 50,
                y: rect.top + window.scrollY - 40
              })
            }}
            onMouseLeave={() => setHoveredCell(null)}
          />
        )
      }
    }

    return (
      <div className="relative overflow-x-auto pb-4">
        <svg width="730" height="120" className="mx-auto select-none">
          {/* Week Labels Y Axis */}
          <text x="5" y="30" fontSize="9" fill="var(--wr-text-3)">Mon</text>
          <text x="5" y="56" fontSize="9" fill="var(--wr-text-3)">Wed</text>
          <text x="5" y="82" fontSize="9" fill="var(--wr-text-3)">Fri</text>

          {/* Month Labels X Axis */}
          <text x="30" y="115" fontSize="9" fill="var(--wr-text-3)">Jan</text>
          <text x="180" y="115" fontSize="9" fill="var(--wr-text-3)">Apr</text>
          <text x="330" y="115" fontSize="9" fill="var(--wr-text-3)">Jul</text>
          <text x="480" y="115" fontSize="9" fill="var(--wr-text-3)">Oct</text>
          <text x="630" y="115" fontSize="9" fill="var(--wr-text-3)">Dec</text>

          {cells}
        </svg>
        
        {/* Heatmap Tooltip */}
        {hoveredCell && (
          <div 
            className="wr-analytics-tooltip shadow-md border border-[var(--wr-border-soft)]"
            style={{ left: hoveredCell.x, top: hoveredCell.y }}
          >
            <strong>{hoveredCell.count}</strong> improvements on {hoveredCell.date}
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Smooth SVG line chart rendering logic (clarity, tone, impact)
  // ---------------------------------------------------------------------------
  const renderTrendChart = () => {
    if (!data || data.score_trends.length === 0) return null

    const width = 450
    const height = 180
    const padding = 25

    const pointsCount = data.score_trends.length
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2

    // Helper to get coordinates
    const getCoords = (index: number, score: number) => {
      const x = padding + (index / (pointsCount - 1 || 1)) * chartWidth
      const y = padding + chartHeight - (score / 10) * chartHeight
      return { x, y }
    }

    // Build path commands
    const buildPath = (key: 'clarity' | 'tone' | 'impact') => {
      let path = ''
      data.score_trends.forEach((pt, i) => {
        const { x, y } = getCoords(i, pt[key])
        if (i === 0) {
          path = `M ${x} ${y}`
        } else {
          // Simple smooth line using bezier midpoint control
          const prev = getCoords(i - 1, data.score_trends[i - 1][key])
          const cpX1 = prev.x + (x - prev.x) / 2
          const cpY1 = prev.y
          const cpX2 = prev.x + (x - prev.x) / 2
          const cpY2 = y
          path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`
        }
      })
      return path
    }

    const clarityPath = buildPath('clarity')
    const tonePath = buildPath('tone')
    const impactPath = buildPath('impact')

    return (
      <div className="relative">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="select-none overflow-visible">
          {/* Y Axis Grid lines */}
          {[0, 2.5, 5, 7.5, 10].map(val => {
            const y = padding + chartHeight - (val / 10) * chartHeight
            return (
              <g key={val}>
                <line 
                  x1={padding} 
                  y1={y} 
                  x2={width - padding} 
                  y2={y} 
                  stroke="var(--wr-border-soft)" 
                  strokeWidth="1"
                  strokeDasharray="4"
                />
                <text x="0" y={y + 3} fontSize="8" fill="var(--wr-text-3)" textAnchor="start">
                  {val}
                </text>
              </g>
            )
          })}

          {/* Clarity Line (Green) */}
          <path d={clarityPath} fill="none" stroke="var(--wr-success)" strokeWidth="2.5" strokeLinecap="round" />
          
          {/* Tone Line (Blue) */}
          <path d={tonePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />

          {/* Impact Line (Amber) */}
          <path d={impactPath} fill="none" stroke="var(--wr-warning)" strokeWidth="2.5" strokeLinecap="round" />

          {/* Render points for hover interactions */}
          {data.score_trends.map((pt, i) => {
            const cClarity = getCoords(i, pt.clarity)
            const cTone = getCoords(i, pt.tone)
            const cImpact = getCoords(i, pt.impact)

            return (
              <g key={i}>
                {/* Clarity dot */}
                <circle 
                  cx={cClarity.x} 
                  cy={cClarity.y} 
                  r="3.5" 
                  fill="var(--wr-success)" 
                  className="cursor-pointer hover:r-5 transition-all duration-100"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoveredPoint({
                      date: pt.date,
                      value: pt.clarity,
                      label: 'Clarity',
                      x: rect.left + window.scrollX - 50,
                      y: rect.top + window.scrollY - 40
                    })
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                
                {/* Tone dot */}
                <circle 
                  cx={cTone.x} 
                  cy={cTone.y} 
                  r="3.5" 
                  fill="#3b82f6" 
                  className="cursor-pointer hover:r-5 transition-all duration-100"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoveredPoint({
                      date: pt.date,
                      value: pt.tone,
                      label: 'Tone',
                      x: rect.left + window.scrollX - 50,
                      y: rect.top + window.scrollY - 40
                    })
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />

                {/* Impact dot */}
                <circle 
                  cx={cImpact.x} 
                  cy={cImpact.y} 
                  r="3.5" 
                  fill="var(--wr-warning)" 
                  className="cursor-pointer hover:r-5 transition-all duration-100"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoveredPoint({
                      date: pt.date,
                      value: pt.impact,
                      label: 'Impact',
                      x: rect.left + window.scrollX - 50,
                      y: rect.top + window.scrollY - 40
                    })
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4 text-xs font-semibold text-[var(--wr-text-2)]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[var(--wr-success)]" />
            <span>Clarity</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#3b82f6]" />
            <span>Tone</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[var(--wr-warning)]" />
            <span>Impact</span>
          </div>
        </div>

        {/* Line Chart Tooltip */}
        {hoveredPoint && (
          <div 
            className="wr-analytics-tooltip shadow-md border border-[var(--wr-border-soft)]"
            style={{ left: hoveredPoint.x, top: hoveredPoint.y }}
          >
            <strong>{hoveredPoint.label}: {hoveredPoint.value}/10</strong> on {hoveredPoint.date}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`wr-analytics-overlay ${isOpen ? 'open' : ''} flex flex-col`}>
      {/* Top controls */}
      <div className="flex items-center justify-between border-b border-[var(--wr-border-med)] pb-4 max-w-[1100px] w-full mx-auto mb-6">
        <div>
          <h1 className="text-3xl font-display font-medium text-[var(--wr-text)]">
            📊 Writing Analytics
          </h1>
          <p className="text-sm text-[var(--wr-text-3)]">A deep look at your patterns and writing profile</p>
        </div>
        <button 
          onClick={onClose}
          className="flex items-center justify-center w-10 h-10 hover:bg-[var(--wr-surface-2)] text-[var(--wr-text-2)] rounded-full border border-[var(--wr-border)] transition-colors duration-150"
          aria-label="Close analytics panel"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--wr-text-3)] font-medium">
          Compiling deep analytics report...
        </div>
      ) : !data ? (
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--wr-text-2)]">
          No analytics data available yet. Keep writing to generate details!
        </div>
      ) : (
        <div className="flex-1 max-w-[1100px] w-full mx-auto flex flex-col gap-6">
          {/* Top Streak Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="wr-analytics-card flex items-center gap-4">
              <span className="text-3xl">🔥</span>
              <div>
                <span className="text-xs text-[var(--wr-text-3)] block font-bold uppercase tracking-wider">Current Streak</span>
                <span className="text-2xl font-bold font-mono text-[var(--wr-text)]">{data.streak.current} days</span>
              </div>
            </div>
            <div className="wr-analytics-card flex items-center gap-4">
              <span className="text-3xl">🏆</span>
              <div>
                <span className="text-xs text-[var(--wr-text-3)] block font-bold uppercase tracking-wider">Longest Streak</span>
                <span className="text-2xl font-bold font-mono text-[var(--wr-text)]">{data.streak.longest} days</span>
              </div>
            </div>
            <div className="wr-analytics-card flex items-center gap-4">
              <span className="text-3xl">📝</span>
              <div>
                <span className="text-xs text-[var(--wr-text-3)] block font-bold uppercase tracking-wider">Total Writing Days</span>
                <span className="text-2xl font-bold font-mono text-[var(--wr-text)]">{data.streak.total_days} days</span>
              </div>
            </div>
          </div>

          {/* Heatmap Row */}
          <div className="wr-analytics-card flex flex-col gap-4">
            <h3 className="text-sm font-bold text-[var(--wr-text-3)] uppercase tracking-wider">
              Writing Frequency (Last 12 Months)
            </h3>
            {renderHeatmap()}
          </div>

          {/* Split Charts & Writing DNA Grid */}
          <div className="wr-analytics-grid">
            {/* Trend Chart */}
            <div className="wr-analytics-card flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--wr-text-3)] uppercase tracking-wider">
                AI Score Trends (Last 30 Days)
              </h3>
              {renderTrendChart()}
            </div>

            {/* Writing DNA */}
            <div className="wr-analytics-card flex flex-col gap-4 justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--wr-text-3)] uppercase tracking-wider mb-2">
                  Your Writing DNA
                </h3>
                <h2 className="text-2xl font-display font-medium text-[var(--wr-text)] mb-3">Your Writing Style</h2>
                <p className="text-sm italic leading-relaxed text-[var(--wr-text-2)] font-display mb-4">
                  "{data.writing_dna.style_summary}"
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {data.writing_dna.signature_phrases.map((phrase, idx) => (
                    <span key={idx} className="text-xs px-2.5 py-1 bg-[var(--wr-surface-2)] text-[var(--wr-text-2)] rounded-md font-semibold">
                      "{phrase}"
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Bottom Trajectory & Percentile */}
              <div className="border-t border-[var(--wr-border-soft)] pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--wr-text-3)] font-semibold">Improvement Trajectory</span>
                  <span className="font-bold text-[var(--wr-accent)]">
                    {data.writing_dna.improvement_trajectory === 'improving' ? '📈 Improving' : '→ Stable'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--wr-text-3)] font-semibold">Global Percentile</span>
                    <span className="font-bold text-[var(--wr-text)]">{data.writing_dna.percentile}%</span>
                  </div>
                  <div className="w-full h-2 bg-[var(--wr-surface-2)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[var(--wr-accent)] rounded-full transition-all duration-500" 
                      style={{ width: `${data.writing_dna.percentile}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--wr-text-3)]">
                    You write more clearly than {data.writing_dna.percentile}% of WriteRight users.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Vocabulary stats & top mistakes */}
          <div className="wr-analytics-grid">
            <div className="wr-analytics-card flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--wr-text-3)] uppercase tracking-wider">
                Vocabulary Statistics
              </h3>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between border-b border-[var(--wr-border-soft)] pb-2">
                  <span className="text-[var(--wr-text-2)]">Unique Words Used</span>
                  <span className="font-bold font-mono text-[var(--wr-text)]">{data.vocabulary_stats.unique_words_used}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--wr-border-soft)] pb-2">
                  <span className="text-[var(--wr-text-2)]">Average Sentence Length</span>
                  <span className="font-bold font-mono text-[var(--wr-text)]">{data.vocabulary_stats.avg_sentence_length} words</span>
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs text-[var(--wr-text-3)] font-semibold uppercase">Most Improved Areas</span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.vocabulary_stats.most_improved_areas.map((area, idx) => (
                      <span key={idx} className="text-xs bg-[var(--wr-accent-soft)] text-[var(--wr-accent)] px-2.5 py-0.5 rounded-full font-semibold">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="wr-analytics-card flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[var(--wr-text-3)] uppercase tracking-wider">
                Top Areas of Friction
              </h3>
              <div className="flex flex-col gap-2">
                {data.vocabulary_stats.top_mistakes.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs p-2 bg-[var(--wr-surface-2)] rounded">
                    <span className="text-[var(--wr-text-2)] truncate max-w-[240px]" title={item.mistake}>
                      {idx + 1}. {item.mistake}
                    </span>
                    <span className="font-bold text-[var(--wr-error)] bg-red-100 dark:bg-red-950/40 px-2 py-0.5 rounded">
                      {item.count} flagged
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default AnalyticsView
