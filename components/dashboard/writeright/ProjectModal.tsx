'use client'

import React, { useState, useEffect } from 'react'
import { X, Folder, Briefcase, BookOpen, Presentation, FileText, Zap, Star } from 'lucide-react'

export interface ProjectData {
  id: string
  name: string
  description: string | null
  icon: string
  created_at?: string
  updated_at?: string
}

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (project: Omit<ProjectData, 'id'>) => Promise<void>
  initialData?: ProjectData | null
}

const ICONS = [
  { name: 'Folder', icon: Folder },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Presentation', icon: Presentation },
  { name: 'FileText', icon: FileText },
  { name: 'Zap', icon: Zap },
  { name: 'Star', icon: Star },
]

export function ProjectModal({ isOpen, onClose, onSave, initialData }: ProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('Folder')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name ?? '')
      setDescription(initialData?.description ?? '')
      setIcon(initialData?.icon ?? 'Folder')
      setError('')
    }
  }, [isOpen, initialData])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Project name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onSave({ name, description, icon })
      onClose()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Failed to save project')
      } else {
        setError('Failed to save project')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(26,23,19,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fade-in 0.15s ease',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-medium)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 12px 40px rgba(26,23,19,0.2)',
          animation: 'scale-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-soft)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
            {initialData ? 'Edit Project' : 'New Project'}
          </h2>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#DC2626', fontSize: 13, fontWeight: 500 }}>
              {error}
            </div>
          )}
          
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Project Icon
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ICONS.map((ic) => {
                const IconComp = ic.icon
                const isSelected = icon === ic.name
                return (
                  <button
                    key={ic.name}
                    type="button"
                    onClick={() => setIcon(ic.name)}
                    style={{
                      width: 40, height: 40,
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isSelected ? 'var(--ink)' : 'var(--bg-raised)',
                      color: isSelected ? 'white' : 'var(--text-3)',
                      border: isSelected ? '1px solid var(--ink)' : '1px solid var(--border-soft)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <IconComp size={18} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="proj-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Project Name
            </label>
            <input
              id="proj-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Marketing Campaign, Client Pitch"
              autoFocus
              style={{
                width: '100%', height: 42, padding: '0 14px',
                background: 'var(--bg-raised)', border: '1px solid var(--border-soft)',
                borderRadius: 10, color: 'var(--text-1)', fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label htmlFor="proj-desc" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Description <span style={{ color: 'var(--text-3)', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </label>
            <textarea
              id="proj-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'var(--bg-raised)', border: '1px solid var(--border-soft)',
                borderRadius: 10, color: 'var(--text-1)', fontSize: 14,
                outline: 'none', resize: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                height: 38, padding: '0 16px', borderRadius: 8,
                background: 'transparent', border: '1px solid var(--border-medium)',
                color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ height: 38, padding: '0 20px', borderRadius: 8, fontSize: 13 }}
            >
              {loading ? 'Saving...' : initialData ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
