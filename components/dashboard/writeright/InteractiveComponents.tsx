import React, { useState } from 'react'
import { Calendar, Download, CheckSquare, Check } from 'lucide-react'
import { TriageItem } from '@/types/writeright'

export function MeetingCard({ meeting }: { meeting: { title?: string; time?: string; intent?: string } }) {
  const query = new URLSearchParams({
    title: meeting.title || 'Meeting',
    time: meeting.time || '',
    description: meeting.intent || '',
  }).toString()

  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8081'
  const icsUrl = `${gatewayUrl}/v1/tools/calendar.ics?${query}`

  return (
    <div className="wr-interactive-card wr-meeting-card" role="region" aria-label="Meeting invitation">
      <div className="wr-interactive-icon" aria-hidden="true">
        <Calendar size={18} />
      </div>
      <div className="wr-interactive-content">
        <div className="wr-interactive-title">{meeting.title || 'Meeting Detected'}</div>
        <div className="wr-interactive-detail">{meeting.time}</div>
        {meeting.intent && <div className="wr-interactive-subtext">{meeting.intent}</div>}
      </div>
      <a 
        href={icsUrl} 
        className="wr-interactive-action-btn"
        aria-label={`Add ${meeting.title || 'meeting'} to calendar`}
      >
        <Download size={14} /> Add to Calendar
      </a>
    </div>
  )
}

export function ActionChecklist({ items }: { items: string[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  const toggle = (idx: number) => {
    setChecked(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      toggle(idx)
    }
  }

  return (
    <div className="wr-interactive-card wr-checklist-card" role="region" aria-label="Action items checklist">
      <div className="wr-interactive-icon" aria-hidden="true">
        <CheckSquare size={18} />
      </div>
      <div className="wr-interactive-content">
        <div className="wr-interactive-title">Action Items</div>
        <div className="wr-checklist-items" role="list">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`wr-checklist-item${checked[idx] ? ' checked' : ''}`}
              onClick={() => toggle(idx)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              role="checkbox"
              aria-checked={checked[idx] || false}
              tabIndex={0}
            >
              <div className="wr-checkbox" aria-hidden="true">
                {checked[idx] && <Check size={10} />}
              </div>
              <span className="wr-checklist-text">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TriageCard({ item, onStartDraft }: { item: TriageItem, onStartDraft: (draft: string) => void }) {
  const urgencyColor = item.urgency === 'High' ? 'var(--wr-error)' : item.urgency === 'Medium' ? 'var(--wr-warning)' : 'var(--wr-accent)'
  
  return (
    <div className="wr-triage-card">
      <div className="wr-triage-card-header">
        <div className="wr-triage-urgency" style={{ background: urgencyColor }}>{item.urgency}</div>
        <div className="wr-triage-category">{item.category}</div>
      </div>
      <div className="wr-triage-subject">{item.subject}</div>
      <div className="wr-triage-summary">{item.summary}</div>
      
      {item.action_items.length > 0 && (
        <div className="wr-triage-actions">
          <div className="wr-triage-actions-label">Next Steps:</div>
          {item.action_items.map((ai, idx) => (
            <div key={idx} className="wr-triage-action-item">• {ai}</div>
          ))}
        </div>
      )}
      
      <div className="wr-triage-replies">
        {item.smart_replies.map((reply, idx) => (
          <button 
            key={idx} 
            className="wr-triage-reply-btn"
            onClick={() => onStartDraft(reply)}
            title={reply}
          >
            {idx === 0 ? 'Short' : idx === 1 ? 'Detailed' : 'Decline'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TriageBoard({ items, onStartDraft }: { items: TriageItem[], onStartDraft: (draft: string) => void }) {
  const high = items.filter(i => i.urgency === 'High')
  const med = items.filter(i => i.urgency === 'Medium')
  const low = items.filter(i => i.urgency === 'Low')

  return (
    <div className="wr-triage-board">
      <div className="wr-triage-column">
        <div className="wr-triage-col-head urgent">Urgent ({high.length})</div>
        <div className="wr-triage-col-list">
          {high.map(item => <TriageCard key={item.id} item={item} onStartDraft={onStartDraft} />)}
          {high.length === 0 && <div className="wr-triage-empty">Clear!</div>}
        </div>
      </div>
      <div className="wr-triage-column">
        <div className="wr-triage-col-head important">Important ({med.length})</div>
        <div className="wr-triage-col-list">
          {med.map(item => <TriageCard key={item.id} item={item} onStartDraft={onStartDraft} />)}
          {med.length === 0 && <div className="wr-triage-empty">Empty</div>}
        </div>
      </div>
      <div className="wr-triage-column">
        <div className="wr-triage-col-head later">Later ({low.length})</div>
        <div className="wr-triage-col-list">
          {low.map(item => <TriageCard key={item.id} item={item} onStartDraft={onStartDraft} />)}
          {low.length === 0 && <div className="wr-triage-empty">Empty</div>}
        </div>
      </div>
    </div>
  )
}
