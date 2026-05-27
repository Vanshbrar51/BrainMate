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
      } catch {
        // Silent failure - will show empty state UI
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

    const counts: Record<string, number> = {}
    data.heatmap.forEach(h => { counts[h.date] = h.count })

    const cellSize = 10
    const cellGap = 3
    const weeksCount = 53
    const daysCount = 7
    const cells: React.ReactNode[] = []

    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - (weeksCount * daysCount) + 1)

    const getCellColor = (count: number) => {
      if (!count) return 'var(--wr-surface-2)'
      if (count === 1) return 'var(--wr-accent-soft)'
      if (count === 2) return 'rgba(217,119,87,0.45)'
      if (count <= 4) return 'var(--wr-accent)'
      return 'var(--wr-accent-hover)'
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
            className="wr-analytics-heatmap-cell"
            style={{ cursor: 'pointer' }}
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
      <div style={{ position: 'relative', overflowX: 'auto', paddingBottom: '1rem' }}>
        <svg width="730" height="120" style={{ display: 'block', margin: '0 auto', userSelect: 'none' }}>
          <text x="5" y="30" fontSize="9" fill="var(--wr-text-3)">Mon</text>
          <text x="5" y="56" fontSize="9" fill="var(--wr-text-3)">Wed</text>
          <text x="5" y="82" fontSize="9" fill="var(--wr-text-3)">Fri</text>
          <text x="30" y="115" fontSize="9" fill="var(--wr-text-3)">Jan</text>
          <text x="180" y="115" fontSize="9" fill="var(--wr-text-3)">Apr</text>
          <text x="330" y="115" fontSize="9" fill="var(--wr-text-3)">Jul</text>
          <text x="480" y="115" fontSize="9" fill="var(--wr-text-3)">Oct</text>
          <text x="630" y="115" fontSize="9" fill="var(--wr-text-3)">Dec</text>
          {cells}
        </svg>
        {hoveredCell && (
          <div
            className="wr-analytics-tooltip"
            style={{ left: hoveredCell.x, top: hoveredCell.y, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', border: '1px solid var(--wr-border-soft)' }}
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

    const getCoords = (index: number, score: number) => ({
      x: padding + (index / (pointsCount - 1 || 1)) * chartWidth,
      y: padding + chartHeight - (score / 10) * chartHeight,
    })

    const buildPath = (key: 'clarity' | 'tone' | 'impact') => {
      let path = ''
      data.score_trends.forEach((pt, i) => {
        const { x, y } = getCoords(i, pt[key])
        if (i === 0) {
          path = `M ${x} ${y}`
        } else {
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
      <div style={{ position: 'relative' }}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ userSelect: 'none', overflow: 'visible' }}>
          {[0, 2.5, 5, 7.5, 10].map(val => {
            const y = padding + chartHeight - (val / 10) * chartHeight
            return (
              <g key={val}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--wr-border-soft)" strokeWidth="1" strokeDasharray="4" />
                <text x="0" y={y + 3} fontSize="8" fill="var(--wr-text-3)" textAnchor="start">{val}</text>
              </g>
            )
          })}
          <path d={clarityPath} fill="none" stroke="var(--wr-success)" strokeWidth="2.5" strokeLinecap="round" />
          <path d={tonePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
          <path d={impactPath} fill="none" stroke="var(--wr-warning)" strokeWidth="2.5" strokeLinecap="round" />
          {data.score_trends.map((pt, i) => {
            const cClarity = getCoords(i, pt.clarity)
            const cTone = getCoords(i, pt.tone)
            const cImpact = getCoords(i, pt.impact)
            return (
              <g key={i}>
                <circle cx={cClarity.x} cy={cClarity.y} r="3.5" fill="var(--wr-success)" style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setHoveredPoint({ date: pt.date, value: pt.clarity, label: 'Clarity', x: rect.left + window.scrollX - 50, y: rect.top + window.scrollY - 40 }) }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                <circle cx={cTone.x} cy={cTone.y} r="3.5" fill="#3b82f6" style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setHoveredPoint({ date: pt.date, value: pt.tone, label: 'Tone', x: rect.left + window.scrollX - 50, y: rect.top + window.scrollY - 40 }) }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                <circle cx={cImpact.x} cy={cImpact.y} r="3.5" fill="var(--wr-warning)" style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setHoveredPoint({ date: pt.date, value: pt.impact, label: 'Impact', x: rect.left + window.scrollX - 50, y: rect.top + window.scrollY - 40 }) }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            )
          })}
        </svg>
        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '16px', fontSize: '12px', fontWeight: 600, color: 'var(--wr-text-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--wr-success)', display: 'inline-block' }} />
            <span>Clarity</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
            <span>Tone</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--wr-warning)', display: 'inline-block' }} />
            <span>Impact</span>
          </div>
        </div>
        {hoveredPoint && (
          <div
            className="wr-analytics-tooltip"
            style={{ left: hoveredPoint.x, top: hoveredPoint.y, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', border: '1px solid var(--wr-border-soft)' }}
          >
            <strong>{hoveredPoint.label}: {hoveredPoint.value}/10</strong> on {hoveredPoint.date}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`wr-analytics-overlay ${isOpen ? 'open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Top controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--wr-border-med)', paddingBottom: '1rem', maxWidth: '1100px', width: '100%', margin: '0 auto 1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontFamily: 'var(--font-instrument-serif, Georgia, serif)', fontWeight: 500, color: 'var(--wr-text)', margin: 0 }}>
            📊 Writing Analytics
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--wr-text-3)', margin: '4px 0 0' }}>A deep look at your patterns and writing profile</p>
        </div>
        <button
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--wr-border)', background: 'transparent', color: 'var(--wr-text-2)', cursor: 'pointer' }}
          aria-label="Close analytics panel"
        >
          ✕
        </button>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', color: 'var(--wr-text-3)', fontWeight: 500 }}>
          Compiling deep analytics report...
        </div>
      ) : !data ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', color: 'var(--wr-text-2)' }}>
          No analytics data available yet. Keep writing to generate details!
        </div>
      ) : (
        <div style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top Streak Dashboard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="wr-analytics-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '1.875rem' }}>🔥</span>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--wr-text-3)', display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Streak</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--wr-text)' }}>{data.streak.current} days</span>
              </div>
            </div>
            <div className="wr-analytics-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '1.875rem' }}>🏆</span>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--wr-text-3)', display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Longest Streak</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--wr-text)' }}>{data.streak.longest} days</span>
              </div>
            </div>
            <div className="wr-analytics-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '1.875rem' }}>📝</span>
              <div>
                <span style={{ fontSize: '10px', color: 'var(--wr-text-3)', display: 'block', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Writing Days</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--wr-text)' }}>{data.streak.total_days} days</span>
              </div>
            </div>
          </div>

          {/* Heatmap Row */}
          <div className="wr-analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Writing Frequency (Last 12 Months)
            </h3>
            {renderHeatmap()}
          </div>

          {/* Split Charts & Writing DNA Grid */}
          <div className="wr-analytics-grid">
            <div className="wr-analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                AI Score Trends (Last 30 Days)
              </h3>
              {renderTrendChart()}
            </div>

            {/* Writing DNA */}
            <div className="wr-analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Your Writing DNA
                </h3>
                <h2 style={{ fontSize: '1.5rem', fontFamily: 'var(--font-instrument-serif, Georgia, serif)', fontWeight: 500, color: 'var(--wr-text)', marginBottom: '12px' }}>Your Writing Style</h2>
                <p style={{ fontSize: '0.875rem', fontStyle: 'italic', lineHeight: 1.6, color: 'var(--wr-text-2)', fontFamily: 'var(--font-instrument-serif, Georgia, serif)', marginBottom: '16px' }}>
                  &ldquo;{data.writing_dna.style_summary}&rdquo;
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                  {data.writing_dna.signature_phrases.map((phrase, idx) => (
                    <span key={idx} style={{ fontSize: '10px', padding: '2px 10px', background: 'var(--wr-surface-2)', color: 'var(--wr-text-2)', borderRadius: '4px', fontWeight: 600 }}>
                      &ldquo;{phrase}&rdquo;
                    </span>
                  ))}
                </div>
              </div>

              {/* Bottom Trajectory & Percentile */}
              <div style={{ borderTop: '1px solid var(--wr-border-soft)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--wr-text-3)', fontWeight: 600 }}>Improvement Trajectory</span>
                  <span style={{ fontWeight: 700, color: 'var(--wr-accent)' }}>
                    {data.writing_dna.improvement_trajectory === 'improving' ? '📈 Improving' : '→ Stable'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--wr-text-3)', fontWeight: 600 }}>Global Percentile</span>
                    <span style={{ fontWeight: 700, color: 'var(--wr-text)' }}>{data.writing_dna.percentile}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--wr-surface-2)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{ height: '100%', background: 'var(--wr-accent)', borderRadius: '999px', width: `${data.writing_dna.percentile}%`, transition: 'width 0.5s ease' }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--wr-text-3)' }}>
                    You write more clearly than {data.writing_dna.percentile}% of WriteRight users.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Vocabulary stats & top mistakes */}
          <div className="wr-analytics-grid">
            <div className="wr-analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Vocabulary Statistics
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--wr-border-soft)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--wr-text-2)' }}>Unique Words Used</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--wr-text)' }}>{data.vocabulary_stats.unique_words_used}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--wr-border-soft)', paddingBottom: '8px' }}>
                  <span style={{ color: 'var(--wr-text-2)' }}>Average Sentence Length</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--wr-text)' }}>{data.vocabulary_stats.avg_sentence_length} words</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--wr-text-3)', fontWeight: 700, textTransform: 'uppercase' }}>Most Improved Areas</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {data.vocabulary_stats.most_improved_areas.map((area, idx) => (
                      <span key={idx} style={{ fontSize: '10px', background: 'var(--wr-accent-soft)', color: 'var(--wr-accent)', padding: '2px 10px', borderRadius: '999px', fontWeight: 600 }}>
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="wr-analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Top Areas of Friction
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.vocabulary_stats.top_mistakes.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '8px', background: 'var(--wr-surface-2)', borderRadius: '4px' }}>
                    <span style={{ color: 'var(--wr-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px', whiteSpace: 'nowrap' }} title={item.mistake}>
                      {idx + 1}. {item.mistake}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--wr-error)', background: 'rgba(220,38,38,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
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
