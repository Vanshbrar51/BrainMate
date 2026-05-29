// components/dashboard/writeright/GrammarOverlay.tsx
// Renders the grammar highlight overlay by replacing the standard textarea
// with an interactive highlighted view containing popovers for inline corrections.

import React, { useState, useRef, useEffect } from 'react'
import type { GrammarIssue } from '@/types/writeright'
import { checkGrammar } from '@/lib/grammar-checker'

interface GrammarOverlayProps {
  text: string
  isActive: boolean
  onChange: (text: string) => void
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export const GrammarOverlay: React.FC<GrammarOverlayProps> = ({ text, isActive, onChange }) => {
  const [issues, setIssues] = useState<GrammarIssue[]>([])
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set())
  const [selectedIssue, setSelectedIssue] = useState<{
    issue: GrammarIssue
    x: number
    y: number
    wrapperWidth: number
  } | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)

  // Re-run checking when text changes
  useEffect(() => {
    if (!isActive) return
    const allIssues = checkGrammar(text)
    // Filter out ignored issues
    const activeIssues = allIssues.filter(
      issue => !ignoredKeys.has(`${issue.start}-${issue.end}-${issue.original}`)
    )
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIssues(activeIssues)
  }, [text, isActive, ignoredKeys])

  if (!isActive) return null

  // Generate HTML with highlights
  const getHighlightedHtml = () => {
    let html = ""
    let lastIndex = 0
    const sorted = [...issues].sort((a, b) => a.start - b.start)
    sorted.forEach((issue, index) => {
      if (issue.start < lastIndex) return
      html += escapeHtml(text.slice(lastIndex, issue.start))
      html += `<mark class="wr-grammar-${issue.type}" data-issue-index="${index}">${escapeHtml(issue.original)}</mark>`
      lastIndex = issue.end
    })
    html += escapeHtml(text.slice(lastIndex))
    return html
  }

  const handleTextareaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'MARK') {
      const idxStr = target.getAttribute('data-issue-index')
      if (idxStr !== null) {
        const index = parseInt(idxStr, 10)
        const issue = issues[index]
        if (issue && wrapperRef.current) {
          const rect = target.getBoundingClientRect()
          const wrapRect = wrapperRef.current.getBoundingClientRect()
          setSelectedIssue({
            issue,
            x: rect.left - wrapRect.left,
            y: rect.bottom - wrapRect.top + 4,
            wrapperWidth: wrapperRef.current.clientWidth
          })
        }
      }
    } else {
      setSelectedIssue(null)
    }
  }

  const handleApply = (issue: GrammarIssue) => {
    const updatedText = text.slice(0, issue.start) + issue.suggestion + text.slice(issue.end)
    onChange(updatedText)
    setSelectedIssue(null)
  }

  const handleIgnore = (issue: GrammarIssue) => {
    setIgnoredKeys(prev => {
      const next = new Set(prev)
      next.add(`${issue.start}-${issue.end}-${issue.original}`)
      return next
    })
    setSelectedIssue(null)
  }

  const getIssueBadgeStyle = (type: string): React.CSSProperties => {
    if (type === 'grammar') return { background: 'rgba(220,38,38,0.1)', color: 'var(--wr-error)' }
    if (type === 'indian_english') return { background: 'rgba(217,119,6,0.1)', color: 'var(--wr-warning)' }
    return { background: 'rgba(59,130,246,0.1)', color: 'var(--wr-info)' }
  }

  return (
    <div className="wr-grammar-editor-wrapper" ref={wrapperRef}>
      {/* Contenteditable Container */}
      <div
        dangerouslySetInnerHTML={{ __html: getHighlightedHtml() }}
        onClick={handleTextareaClick}
        className="wr-grammar-editable"
        style={{ minHeight: '180px' }}
      />

      {/* Popover Menu */}
      {selectedIssue && (
        <div
          className="wr-grammar-popover"
          style={{
            left: `${Math.min(selectedIssue.x, (selectedIssue.wrapperWidth || 240) - 250)}px`,
            top: `${selectedIssue.y}px`
          }}
        >
          {/* Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', ...getIssueBadgeStyle(selectedIssue.issue.type) }}>
              {selectedIssue.issue.type.replace('_', ' ')}
            </span>
            <button
              onClick={() => setSelectedIssue(null)}
              style={{ fontSize: '12px', color: 'var(--wr-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          {/* Explanation */}
          <p style={{ fontSize: '12px', color: 'var(--wr-text-2)', lineHeight: 1.5, margin: '8px 0 0' }}>
            {selectedIssue.issue.explanation}
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--wr-border-soft)', paddingTop: '8px', marginTop: '8px' }}>
            <button
              onClick={() => handleIgnore(selectedIssue.issue)}
              style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--wr-text-3)', background: 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'var(--wr-surface-2)' }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent' }}
            >
              Ignore
            </button>
            <button
              onClick={() => handleApply(selectedIssue.issue)}
              style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 600, background: 'var(--wr-accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'var(--wr-accent-hover)' }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'var(--wr-accent)' }}
            >
              Apply: {selectedIssue.issue.suggestion}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
export default GrammarOverlay
