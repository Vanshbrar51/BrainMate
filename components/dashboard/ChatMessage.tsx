'use client'

import React from 'react'

export type Message = { role: 'user' | 'ai'; content: React.ReactNode }

export function UserMessage({ content }: { content: React.ReactNode }) {
  return (
    <div className="chat-msg-user">
      <div className="chat-msg-user-bubble">{content}</div>
    </div>
  )
}

export function AIMessage({
  content,
  emoji,
  moduleColor,
}: {
  content: React.ReactNode
  emoji: string
  moduleColor: string
}) {
  return (
    <div className="chat-msg-ai">
      <div className="chat-msg-ai-header">
        <div
          className="chat-msg-ai-avatar"
          style={{ background: moduleColor + '18', borderColor: moduleColor + '30' }}
        >
          {emoji}
        </div>
        <span className="chat-msg-ai-label">BrainMate</span>
      </div>
      <div className="chat-msg-ai-body">{content}</div>
    </div>
  )
}

export function AIThinking({ emoji }: { emoji: string }) {
  return (
    <div className="chat-msg-ai">
      <div className="chat-msg-ai-header">
        <div className="chat-msg-ai-avatar">{emoji}</div>
        <span className="chat-msg-ai-label" style={{ color: 'var(--text-3)' }}>
          Thinking
        </span>
      </div>
      <div className="chat-msg-ai-body">
        <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="dot-thinking" style={{ animationDelay: i * 0.2 + 's' }} />
          ))}
        </span>
      </div>
    </div>
  )
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="chat-code-block">
      <pre>{code}</pre>
    </div>
  )
}

export function InsightBlock({ children }: { children: React.ReactNode }) {
  return <div className="chat-insight">{children}</div>
}

export function DiffBlock({
  before,
  after,
  explanation,
}: {
  before: string
  after: string
  explanation: string
}) {
  return (
    <>
      <div className="chat-diff-before">
        <span className="chat-diff-label" style={{ color: 'var(--error)' }}>
          Before
        </span>
        {before}
      </div>
      <div className="chat-diff-after">
        <span className="chat-diff-label" style={{ color: 'var(--success)' }}>
          After
        </span>
        {after}
      </div>
      <div className="chat-insight">
        <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>Why: </strong>
        {explanation}
      </div>
    </>
  )
}
