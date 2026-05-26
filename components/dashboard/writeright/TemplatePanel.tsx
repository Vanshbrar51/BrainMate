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
      if (!res.ok) throw new Error('Failed to load templates')
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

      if (!res.ok) throw new Error('AI generation failed')
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
    <div className="flex flex-col h-full bg-[var(--wr-bg)] border border-[var(--wr-border)] rounded-[var(--wr-radius)] p-5 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--wr-border-soft)] pb-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--wr-text)] flex items-center gap-2">
            📂 Template Library
          </h2>
          <p className="text-xs text-[var(--wr-text-3)]">Save and reuse your best phrasing drafts</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--wr-accent-soft)] hover:bg-[var(--wr-accent-hover)] hover:text-white text-[var(--wr-accent)] font-medium text-xs rounded-full transition-all duration-150"
          >
            ✨ AI Generate Template
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--wr-surface-2)] text-[var(--wr-text-3)] rounded-full"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Smart Suggestions Chips */}
      {suggestions.length > 0 && (
        <div className="mb-4 bg-[var(--wr-surface)] border border-[var(--wr-border-soft)] rounded-lg p-3">
          <span className="text-[10px] font-bold text-[var(--wr-text-3)] uppercase tracking-wider block mb-2">Smart Suggestions</span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setAiPrompt(`A template for ${sug.message}`)
                  setAiModalOpen(true)
                  setAiPrompt(`Write a template for: ${sug.message.replace("Would you like a template for that?", "")}`)
                }}
                className="text-xs px-3 py-1.5 bg-[var(--wr-surface-2)] hover:bg-[var(--wr-border-soft)] border border-[var(--wr-border)] rounded-md text-[var(--wr-text-2)] text-left transition-all duration-150"
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
            className="w-full text-sm px-10 py-2 border border-[var(--wr-border)] bg-[var(--wr-surface)] rounded-md outline-none text-[var(--wr-text)]"
          />
          <span className="absolute left-3 top-2.5 text-[var(--wr-text-3)]">🔍</span>
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-[var(--wr-text-3)]"
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
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-all duration-150 ${
                activeCategory === cat 
                  ? 'bg-[var(--wr-accent)] border-[var(--wr-accent)] text-white' 
                  : 'bg-[var(--wr-surface)] border-[var(--wr-border)] text-[var(--wr-text-2)] hover:bg-[var(--wr-surface-2)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid List */}
      <div className="flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-8 text-xs text-[var(--wr-text-3)]">Loading templates...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--wr-text-3)] border border-dashed border-[var(--wr-border)] rounded-md">
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
                className="wr-tpl-card group flex flex-col gap-2 p-3 bg-[var(--wr-surface)] border border-[var(--wr-border)] rounded-md cursor-grab active:cursor-grabbing hover:shadow-sm transition-all duration-150"
              >
                {/* Card Title & Handles */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--wr-text-3)] cursor-grab opacity-50 group-hover:opacity-100">☰</span>
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--wr-text)]">{tpl.name}</h4>
                      <span className="inline-block text-[10px] bg-[var(--wr-surface-2)] text-[var(--wr-text-2)] px-2 py-0.5 rounded mt-1 font-semibold">
                        {tpl.category || (tpl.is_ai_generated ? 'AI Generated' : 'Email')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                      className="p-1 hover:bg-[var(--wr-error)] hover:text-white text-[var(--wr-text-3)] rounded transition-colors duration-150"
                      title="Delete Template"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Preview text */}
                <p className="text-xs text-[var(--wr-text-2)] line-clamp-2 leading-relaxed">
                  {tpl.preview_text || tpl.content}
                </p>

                {/* Expanded preview drawer */}
                {previewId === tpl.id && (
                  <div className="mt-2 p-3 bg-[var(--wr-surface-2)] rounded border border-[var(--wr-border-soft)] text-xs text-[var(--wr-text)] font-mono whitespace-pre-wrap select-all">
                    {tpl.content}
                  </div>
                )}

                {/* Actions & stats footer */}
                <div className="flex items-center justify-between border-t border-[var(--wr-border-soft)] pt-2.5 mt-1 text-[11px] text-[var(--wr-text-3)]">
                  <span>Used {tpl.use_count} times</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPreviewId(previewId === tpl.id ? null : tpl.id)}
                      className="px-2 py-1 bg-[var(--wr-surface-2)] text-[var(--wr-text-2)] hover:bg-[var(--wr-border-soft)] rounded font-semibold"
                    >
                      {previewId === tpl.id ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      onClick={() => onUseTemplate(tpl.content, tpl.mode, tpl.tone)}
                      className="px-3 py-1 bg-[var(--wr-accent)] text-white hover:bg-[var(--wr-accent-hover)] rounded font-semibold"
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
          <div className="flex justify-between items-center border-b border-[var(--wr-border-soft)] pb-3">
            <h3 className="font-bold text-sm text-[var(--wr-text)]">🤖 Describe the Template You Need</h3>
            <button onClick={() => setAiModalOpen(false)} className="text-[var(--wr-text-3)] hover:text-[var(--wr-text)]">✕</button>
          </div>
          <div className="flex flex-col gap-3">
            <textarea
              placeholder="e.g. A follow-up email to a client after a proposal presentation, asking for feedback and suggesting next steps."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              className="wr-gmail-compose-prompt"
            />
            
            {aiResultText && (
              <div className="wr-gmail-compose-stream border border-[var(--wr-border)]">
                {aiResultText}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-[var(--wr-border-soft)] pt-3">
              <button
                onClick={() => setAiModalOpen(false)}
                className="px-3 py-1.5 bg-[var(--wr-surface-2)] hover:bg-[var(--wr-border-soft)] text-xs font-semibold rounded-full text-[var(--wr-text-2)]"
              >
                Cancel
              </button>
              {aiResultText ? (
                <button
                  onClick={handleSaveAiTemplate}
                  className="px-4 py-1.5 bg-[var(--wr-success)] hover:bg-green-600 text-white text-xs font-semibold rounded-full"
                >
                  Save Template
                </button>
              ) : (
                <button
                  onClick={handleGenerateTemplate}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="px-4 py-1.5 bg-[var(--wr-accent)] hover:bg-[var(--wr-accent-hover)] text-white text-xs font-semibold rounded-full disabled:opacity-50"
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
