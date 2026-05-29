'use client'

import React, { useState, useEffect } from 'react'
import { Folder, Briefcase, BookOpen, Presentation, FileText, Zap, Star, Loader2, Plus, Edit2, Trash2 } from 'lucide-react'
import type { ProjectData } from './ProjectModal'

export interface ArtifactData {
  id: string
  title: string
  content: string
  type: 'draft' | 'paragraph' | 'template'
  created_at: string
  updated_at: string
}

interface ProjectViewProps {
  project: ProjectData
  onEdit: (project: ProjectData) => void
  onDelete: (id: string) => void
}

const ICONS: Record<string, React.ElementType> = {
  Folder, Briefcase, BookOpen, Presentation, FileText, Zap, Star
}

export function ProjectView({ project, onEdit, onDelete }: ProjectViewProps) {
  const [artifacts, setArtifacts] = useState<ArtifactData[]>([])
  const [loading, setLoading] = useState(true)

  const IconComp = ICONS[project.icon] || Folder

  useEffect(() => {
    let active = true
    const fetchArtifacts = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/writeright/projects/${project.id}/artifacts`)
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        if (active) setArtifacts(data.artifacts || [])
      } catch (err) {
        console.error(err)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchArtifacts()
    return () => { active = false }
  }, [project.id])

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this project?')) {
      onDelete(project.id)
    }
  }

  return (
    <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 30, height: '100%', overflowY: 'auto' }}>
      {/* Context Hub (Header) */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-1)' }}>
            <IconComp size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{project.name}</h1>
            {project.description && (
              <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-3)' }}>{project.description}</p>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button
                onClick={() => onEdit(project)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Edit2 size={12} /> Edit Project
              </button>
              <button
                onClick={handleDelete}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: '#DC2626', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Trash2 size={12} /> Delete Project
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Artifacts Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saved Artifacts</h2>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> Loading artifacts...
          </div>
        ) : artifacts.length === 0 ? (
          <div style={{ padding: 40, border: '1px dashed var(--border-medium)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'var(--bg-surface)' }}>
            <FileText size={24} color="var(--text-3)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>No artifacts yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Save your drafts, templates, or paragraphs to this project.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {artifacts.map(a => (
              <div key={a.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</h3>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-raised)', color: 'var(--text-3)', textTransform: 'uppercase' }}>
                    {a.type}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {a.content}
                </p>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 'auto', paddingTop: 8 }}>
                  Updated {new Date(a.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
