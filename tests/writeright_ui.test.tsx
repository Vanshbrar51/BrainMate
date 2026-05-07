import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MeetingCard, ActionChecklist, TriageCard } from '../components/dashboard/writeright/InteractiveComponents'
import { TriageItem } from '../types/writeright'

describe('MeetingCard', () => {
  it('renders meeting details correctly', () => {
    const meeting = {
      title: 'Project Sync',
      time: 'Tomorrow at 10 AM',
      intent: 'Discuss next milestones'
    }
    render(<MeetingCard meeting={meeting} />)
    
    expect(screen.getByText('Project Sync')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow at 10 AM')).toBeInTheDocument()
    expect(screen.getByText('Discuss next milestones')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add project sync to calendar/i })).toBeInTheDocument()
  })

  it('renders fallback title when missing', () => {
    render(<MeetingCard meeting={{ time: 'Soon' }} />)
    expect(screen.getByText('Meeting Detected')).toBeInTheDocument()
  })
})

describe('ActionChecklist', () => {
  it('renders items and allows toggling', () => {
    const items = ['Send invoice', 'Book flight']
    render(<ActionChecklist items={items} />)
    
    const firstItem = screen.getByText('Send invoice').closest('[role="checkbox"]')
    expect(firstItem).toHaveAttribute('aria-checked', 'false')
    
    if (firstItem) {
      fireEvent.click(firstItem)
      expect(firstItem).toHaveAttribute('aria-checked', 'true')
    }
  })
})

describe('TriageCard', () => {
  it('calls onStartDraft when a reply button is clicked', () => {
    const item: TriageItem = {
      id: '1',
      subject: 'Urgent Help',
      summary: 'Client needs assistance',
      urgency: 'High',
      category: 'Client',
      smart_replies: ['I will help', 'Busy now', 'No thanks'],
      action_items: ['Call client'],
      original_segment: '...'
    }
    const onStartDraft = vi.fn()
    render(<TriageCard item={item} onStartDraft={onStartDraft} />)
    
    fireEvent.click(screen.getByText('Short'))
    expect(onStartDraft).toHaveBeenCalledWith('I will help')
  })
})
