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
    setIssues(activeIssues)
  }, [text, isActive, ignoredKeys])

  if (!isActive) return null

  // Generate HTML with highlights
  const getHighlightedHtml = () => {
    let html = ""
    let lastIndex = 0

    // Filter and sort non-overlapping issues
    const sorted = [...issues].sort((a, b) => a.start - b.start)
    
    sorted.forEach((issue, index) => {
      if (issue.start < lastIndex) return // Skip overlapping match
      
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
            y: rect.bottom - wrapRect.top + 4
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
            left: `${Math.min(selectedIssue.x, (wrapperRef.current?.clientWidth || 240) - 250)}px`, 
            top: `${selectedIssue.y}px` 
          }}
        >
          {/* Badge */}
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
              selectedIssue.issue.type === 'grammar' ? 'bg-red-100 text-[var(--wr-error)]' :
              selectedIssue.issue.type === 'indian_english' ? 'bg-amber-100 text-[var(--wr-warning)]' :
              'bg-blue-100 text-blue-600'
            }`}>
              {selectedIssue.issue.type.replace('_', ' ')}
            </span>
            <button 
              onClick={() => setSelectedIssue(null)}
              className="text-xs text-[var(--wr-text-3)] hover:text-[var(--wr-text-2)]"
            >
              ✕
            </button>
          </div>

          {/* Explanation */}
          <p className="text-xs text-[var(--wr-text-2)] leading-relaxed">
            {selectedIssue.issue.explanation}
          </p>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 border-t border-[var(--wr-border-soft)] pt-2 mt-1">
            <button
              onClick={() => handleIgnore(selectedIssue.issue)}
              className="px-2 py-1 text-[11px] font-semibold text-[var(--wr-text-3)] hover:bg-[var(--wr-surface-2)] rounded"
            >
              Ignore
            </button>
            <button
              onClick={() => handleApply(selectedIssue.issue)}
              className="px-3 py-1 text-[11px] font-semibold bg-[var(--wr-accent)] text-white hover:bg-[var(--wr-accent-hover)] rounded"
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
