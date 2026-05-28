// components/dashboard/writeright/TemplatePanel.tsx
// Advanced writing template panel featuring categories, client-side search, AI template generation, 
// smart context-aware suggestions, and native HTML5 drag-and-drop ordering.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { TemplateRow, TemplateSuggestion, WritingMode, ToneOption } from '@/types/writeright'

interface TemplatePanelProps {
  onUseTemplate: (content: string, mode: WritingMode, tone: ToneOption) => void
  onClose: () => void
}

const CATEGORIES = ['All', 'Email', 'LinkedIn', 'Paragraph', 'WhatsApp', 'AI Generated']

export const TemplatePanel: React.FC<TemplatePanelProps> = ({ onUseTemplate, onClose }) => {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)

  // Smart suggestions
  const [suggestions, setSuggestions] = useState<TemplateSuggestion[]>([])
  
  // AI generation modal
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiResultText, setAiResultText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Drag state
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)

  // 1. Fetch templates from DB
  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/writeright/templates')
      if (!res.ok) {

        return
      }
      const data = await res.json()
      
      // Sort by sort_order if present, otherwise fallback
      const sorted = (data.templates || []).sort((a: TemplateRow, b: TemplateRow) => {
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      setTemplates(sorted)
    } catch (err) {
      setError('Could not retrieve templates.')
    } finally {
      setLoading(false)
    }
  }, [])

  // 2. Fetch smart suggestions
  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/writeright/templates/suggest')
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      }
    } catch {
      // Fail silently
    }
  }, [])

  useEffect(() => {
    loadTemplates()
    loadSuggestions()
  }, [loadTemplates, loadSuggestions])

  // 3. Delete Template
  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this template?')) return
    try {
      const res = await fetch(`/api/writeright/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
      }
    } catch {
      alert('Failed to delete template')
    }
  }

  // 4. Create AI Template
  const handleGenerateTemplate = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiResultText('')

    try {
      const res = await fetch('/api/writeright/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      })

      if (!res.ok) {

        return
      }
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ""

        for (const line of lines) {
          const cleanLine = line.trim()
          if (cleanLine.startsWith("data: ")) {
            try {
              const data = JSON.parse(cleanLine.slice(6))
              if (data.type === "token" && data.text) {
                setAiResultText(prev => prev + data.text)
              }
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch {
      alert('AI Template generation failed')
    } finally {
      setAiLoading(false)
    }
  }

  // Save AI Template to DB
  const handleSaveAiTemplate = async () => {
    if (!aiResultText.trim()) return
    try {
      const res = await fetch('/api/writeright/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: aiResultText,
          name: aiPrompt.slice(0, 40) + ' Template',
          mode: 'email',
          tone: 'Professional',
          metadata: { category: 'AI Generated', is_ai_generated: true }
        })
      })

      if (res.ok) {
        const data = await res.json()
        if (data.template) {
          setTemplates(prev => [...prev, { ...data.template, category: 'AI Generated', is_ai_generated: true }])
          setAiModalOpen(false)
          setAiPrompt('')
          setAiResultText('')
        }
      }
    } catch {
      alert('Failed to save generated template')
    }
  }

  // 5. Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index
    e.currentTarget.classList.add('dragging')
  }

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index
  }

  const handleDragEnd = async (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragging')
    if (dragItem.current === null || dragOverItem.current === null) return
    if (dragItem.current === dragOverItem.current) return

    const newTemplates = [...templates]
    const draggedItemContent = newTemplates[dragItem.current]
    newTemplates.splice(dragItem.current, 1)
    newTemplates.splice(dragOverItem.current, 0, draggedItemContent)

    // Update local state immediately
    setTemplates(newTemplates)

    // Reset references
    dragItem.current = null
    dragOverItem.current = null

    // Persist sorting order to DB
    try {
      await fetch('/api/writeright/templates/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newTemplates.map(t => t.id) })
      })
    } catch {
      // Revert if API fail
      loadTemplates()
    }
  }

  // 6. Filtering templates client-side
  const filteredTemplates = templates.filter(t => {
    // Category match
    const cat = t.category || (t.is_ai_generated ? 'AI Generated' : 'Email')
    const matchesCategory = activeCategory === 'All' || cat.toLowerCase() === activeCategory.toLowerCase()
    
    // Search query match
    const query = searchQuery.toLowerCase()
    const matchesSearch = t.name.toLowerCase().includes(query) || t.content.toLowerCase().includes(query)
    
    return matchesCategory && matchesSearch
  })

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--wr-bg)', border: '1px solid var(--wr-border)', borderRadius: 'var(--wr-radius)', padding: '20px', position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--wr-border-soft)', paddingBottom: '16px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--wr-text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            📂 Template Library
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--wr-text-3)', margin: 0 }}>Save and reuse your best phrasing drafts</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 font-medium text-xs rounded-full transition-all duration-150"
            style={{ background: 'var(--wr-accent-soft)', color: 'var(--wr-accent)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-accent-hover)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-accent-soft)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--wr-accent)' }}
          >
            ✨ AI Generate Template
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full"
            style={{ color: 'var(--wr-text-3)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-surface-2)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Smart Suggestions Chips */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: '16px', background: 'var(--wr-surface)', border: '1px solid var(--wr-border-soft)', borderRadius: '8px', padding: '12px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--wr-text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Smart Suggestions</span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setAiPrompt(`A template for ${sug.message}`)
                  setAiModalOpen(true)
                  setAiPrompt(`Write a template for: ${sug.message.replace("Would you like a template for that?", "")}`)
                }}
                className="text-xs px-3 py-1.5 border rounded-md text-left transition-all duration-150"
                style={{ background: 'var(--wr-surface-2)', border: '1px solid var(--wr-border)', color: 'var(--wr-text-2)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-border-soft)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-surface-2)' }}
              >
                💡 {sug.message}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search & Categories Bar */}
      <div className="flex flex-col gap-3 mb-4">
        {/* Search */}
        <div className="relative">
          <input 
            type="text" 
            placeholder="Search templates by title or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm px-10 py-2 rounded-md outline-none"
            style={{ border: '1px solid var(--wr-border)', background: 'var(--wr-surface)', color: 'var(--wr-text)' }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--wr-text-3)' }}>🔍</span>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '12px', top: '10px', fontSize: '12px', color: 'var(--wr-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Categories Pills */}
        <div className="wr-tpl-category-row flex gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-all duration-150`}
              style={activeCategory === cat
                ? { background: 'var(--wr-accent)', borderColor: 'var(--wr-accent)', color: '#fff' }
                : { background: 'var(--wr-surface)', borderColor: 'var(--wr-border)', color: 'var(--wr-text-2)' }}
              onMouseEnter={e => { if (activeCategory !== cat) (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-surface-2)' }}
              onMouseLeave={e => { if (activeCategory !== cat) (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-surface)' }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', fontSize: '12px', color: 'var(--wr-text-3)' }}>Loading templates...</div>
        ) : filteredTemplates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', fontSize: '12px', color: 'var(--wr-text-3)', border: '1px dashed var(--wr-border)', borderRadius: '6px' }}>
            No templates found in this section.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredTemplates.map((tpl, index) => (
              <div 
                key={tpl.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="wr-tpl-card group flex flex-col gap-2 p-3 rounded-md cursor-grab active:cursor-grabbing transition-all duration-150"
                style={{ background: 'var(--wr-surface)', border: '1px solid var(--wr-border)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
              >
                {/* Card Title & Handles */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--wr-text-3)', cursor: 'grab', opacity: 0.5 }} className="group-hover:opacity-100">☰</span>
                    <div>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--wr-text)', margin: 0 }}>{tpl.name}</h4>
                      <span style={{ display: 'inline-block', fontSize: '10px', background: 'var(--wr-surface-2)', color: 'var(--wr-text-2)', padding: '2px 8px', borderRadius: '4px', marginTop: '4px', fontWeight: 600 }}>
                        {tpl.category || (tpl.is_ai_generated ? 'AI Generated' : 'Email')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                      className="p-1 rounded transition-colors duration-150"
                      style={{ color: 'var(--wr-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-error)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--wr-text-3)' }}
                      title="Delete Template"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Preview text */}
                <p style={{ fontSize: '12px', color: 'var(--wr-text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5, margin: 0 }}>
                  {tpl.preview_text || tpl.content}
                </p>

                {/* Expanded preview drawer */}
                {previewId === tpl.id && (
                  <div style={{ marginTop: '8px', padding: '12px', background: 'var(--wr-surface-2)', borderRadius: '4px', border: '1px solid var(--wr-border-soft)', fontSize: '12px', color: 'var(--wr-text)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', userSelect: 'all' }}>
                    {tpl.content}
                  </div>
                )}

                {/* Actions & stats footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--wr-border-soft)', paddingTop: '10px', marginTop: '4px', fontSize: '11px', color: 'var(--wr-text-3)' }}>
                  <span>Used {tpl.use_count} times</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPreviewId(previewId === tpl.id ? null : tpl.id)}
                      className="px-2 py-1 rounded font-semibold"
                      style={{ background: 'var(--wr-surface-2)', color: 'var(--wr-text-2)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-border-soft)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-surface-2)' }}
                    >
                      {previewId === tpl.id ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      onClick={() => onUseTemplate(tpl.content, tpl.mode, tpl.tone)}
                      className="px-3 py-1 text-white rounded font-semibold"
                      style={{ background: 'var(--wr-accent)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-accent-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-accent)' }}
                    >
                      Use
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Generate Modal */}
      {aiModalOpen && (
        <div className="wr-gmail-schedule-modal flex flex-col gap-4 max-w-lg w-full z-50">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--wr-border-soft)', paddingBottom: '12px' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--wr-text)', margin: 0 }}>🤖 Describe the Template You Need</h3>
            <button onClick={() => setAiModalOpen(false)} style={{ color: 'var(--wr-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--wr-text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--wr-text-3)' }}
            >✕</button>
          </div>
          <div className="flex flex-col gap-3">
            <textarea
              placeholder="e.g. A follow-up email to a client after a proposal presentation, asking for feedback and suggesting next steps."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="wr-gmail-compose-prompt"
            />
            
            {aiResultText && (
              <div className="wr-gmail-compose-stream" style={{ border: '1px solid var(--wr-border)' }}>
                {aiResultText}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid var(--wr-border-soft)' }}>
              <button
                onClick={() => setAiModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-full"
                style={{ background: 'var(--wr-surface-2)', color: 'var(--wr-text-2)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-border-soft)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-surface-2)' }}
              >
                Cancel
              </button>
              {aiResultText ? (
                <button
                  onClick={handleSaveAiTemplate}
                  className="px-4 py-1.5 text-white text-xs font-semibold rounded-full"
                  style={{ background: 'var(--wr-success)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16803a' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-success)' }}
                >
                  Save Template
                </button>
              ) : (
                <button
                  onClick={handleGenerateTemplate}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="px-4 py-1.5 text-white text-xs font-semibold rounded-full disabled:opacity-50"
                  style={{ background: 'var(--wr-accent)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-accent-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--wr-accent)' }}
                >
                  {aiLoading ? 'Generating...' : 'Generate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
