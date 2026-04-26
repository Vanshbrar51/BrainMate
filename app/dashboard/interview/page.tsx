'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Send,
  Paperclip,
  FileCode,
  ArrowRight,
  Gauge,
  Mic,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react'
import { type Message, UserMessage, AIMessage, AIThinking, InsightBlock } from '@/components/dashboard/ChatMessage'

const PROMPTS = [
  'Practice a technical interview for Frontend Lead',
  'Help me prepare for behavioral questions using STAR',
  'Review my elevator pitch for a Senior PM role',
]

const MOCK_QA = [
  {
    question: 'Tell me about a time you had to resolve a high-pressure production issue with your team.',
    feedback:
      'Strong structure using STAR. Add concrete metrics for impact and mention your delegation strategy.',
    score: 84,
  },
  {
    question: 'How do you prioritize conflicting product and engineering deadlines?',
    feedback:
      'Great prioritization framework. Improve by giving one real scenario with timeline tradeoffs.',
    score: 79,
  },
  {
    question: 'What is your approach to mentoring junior engineers?',
    feedback:
      'Clear and empathetic approach. Add one example showing how you measured growth over time.',
    score: 88,
  },
]

type ViewState = 'setup' | 'active' | 'scored'

function ScoredMessage({ avgScore }: { avgScore: number }) {
  return (
    <>
      <div
        style={{
          textAlign: 'center',
          paddingBottom: 24,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-3)',
            marginBottom: 12,
          }}
        >
          Overall Score
        </p>
        <div className="chat-score-num">{avgScore}</div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>
          {avgScore >= 85
            ? 'Excellent — ready to interview'
            : avgScore >= 70
              ? 'Good — a few areas to refine'
              : 'Developing — keep practising'}
        </p>
      </div>
      {MOCK_QA.map((item, i) => (
        <InsightBlock key={item.question + i}>
          <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>Q{i + 1}: </strong>
          {item.feedback}{' '}
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--mod-interview)' }}>
            ({item.score}/100)
          </span>
        </InsightBlock>
      ))}
    </>
  )
}

export default function InterviewProPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [state, setState] = useState<ViewState>('setup')
  const [qIndex, setQIndex] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const avgScore = Math.round(MOCK_QA.reduce((sum, q) => sum + q.score, 0) / MOCK_QA.length)

  const scrollBottom = () =>
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }), 60)

  const addQuestionMessage = useCallback((idx: number) => {
    const question = MOCK_QA[idx]
    const progress = Math.round(((idx + 1) / MOCK_QA.length) * 100)
    const questionNode = (
      <>
        <p style={{ marginBottom: 10, color: 'var(--text-1)', fontWeight: 600 }}>
          Question {idx + 1} / {MOCK_QA.length}
        </p>
        <div className="chat-progress-track" style={{ marginBottom: 12 }}>
          <div className="chat-progress-fill" style={{ width: progress + '%' }} />
        </div>
        <p>{question.question}</p>
      </>
    )
    setMessages((prev) => [...prev, { role: 'ai', content: questionNode }])
  }, [])

  const startSession = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim()
      if (!msg || loading) return

      setLoading(true)
      setInput('')
      setHasStarted(true)
      setState('active')
      setQIndex(0)
      setMessages((prev) => [...prev, { role: 'user', content: msg }])
      scrollBottom()
      await new Promise((r) => setTimeout(r, 1100)) // TODO: replace with real Anthropic API call
      addQuestionMessage(0)
      setLoading(false)
      scrollBottom()
    },
    [input, loading, addQuestionMessage]
  )

  const submit = useCallback(async () => {
    const msg = input.trim()
    if (!msg || loading) return

    if (state === 'setup') {
      await startSession()
      return
    }

    setLoading(true)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    scrollBottom()
    await new Promise((r) => setTimeout(r, 900)) // TODO: replace with real Anthropic API call

    if (qIndex < MOCK_QA.length - 1) {
      const next = qIndex + 1
      setQIndex(next)
      addQuestionMessage(next)
    } else {
      setState('scored')
      const scoredNode = <ScoredMessage avgScore={avgScore} />
      setMessages((prev) => [...prev, { role: 'ai', content: scoredNode }])
    }
    setLoading(false)
    scrollBottom()
  }, [input, loading, state, startSession, qIndex, addQuestionMessage, avgScore])

  return (
    <div className="chat-workspace-with-panel" data-module="interview">
      <div className="chat-workspace-main">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-scroll-inner">
            {!hasStarted && (
              <div className="chat-empty">
                <div
                  className="chat-module-icon"
                  style={{
                    background: 'var(--mod-interview-bg)',
                    borderColor: 'var(--mod-interview-border)',
                  }}
                >
                  🎤
                </div>
                <h1 className="chat-module-title">InterviewPro</h1>
                <p className="chat-module-tagline">
                  Ready to land your dream job? Practice with realistic interview simulations and
                  instant feedback.
                </p>

                <div className="chat-prompts-list" style={{ marginTop: 8 }}>
                  {PROMPTS.map((p) => (
                    <button key={p} className="chat-prompt-row" onClick={() => startSession(p)}>
                      <span className="chat-prompt-chip-title">{p}</span>
                      <ArrowUpRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasStarted && (
              <div className="chat-messages">
                {messages.map((m, i) =>
                  m.role === 'user' ? (
                    <UserMessage key={i} content={m.content} />
                  ) : (
                    <AIMessage
                      key={i}
                      content={m.content}
                      emoji="🎤"
                      moduleColor="var(--mod-interview)"
                    />
                  )
                )}
                {loading && <AIThinking emoji="🎤" />}
              </div>
            )}
          </div>
        </div>

        <div className="chat-input-bar">
          <div className="chat-input-bar-inner">
            <div className="chat-input-box">
              <textarea
                ref={taRef}
                className="chat-textarea"
                placeholder="Type your message or ask for a specific role..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={(e) => {
                  const t = e.currentTarget
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 260) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                rows={2}
              />
              <div className="chat-input-footer">
                <div className="chat-tools-left">
                  <button className="chat-tool-btn" aria-label="Attach file">
                    <Paperclip size={17} />
                  </button>
                  <button className="chat-tool-btn" aria-label="Attach notes">
                    <FileCode size={17} />
                  </button>
                </div>
                <div className="chat-tools-right">
                  <span className="chat-hint">{state === 'active' ? 'answer then send' : '↵ to send'}</span>
                  <button
                    className="chat-send-btn"
                    onClick={() => submit()}
                    disabled={!input.trim() || loading}
                    aria-label="Send"
                  >
                    {state === 'active' ? (
                      <ArrowRight size={15} strokeWidth={2.2} />
                    ) : (
                      <Send size={15} strokeWidth={2.2} />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <p className="chat-disclaimer">
              InterviewPro simulates real interviews. Practise regularly for best results.
            </p>
          </div>
        </div>
      </div>

      <div className="chat-right-panel">
        <div className="chat-panel-header">Session Analytics</div>

        <div className="chat-panel-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Gauge size={14} style={{ color: 'var(--mod-interview)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Overall Score</span>
          </div>
          <div className="chat-progress-track" style={{ marginBottom: 6 }}>
            <div className="chat-progress-fill" style={{ width: '62%' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-3)' }}>avg. across 3 mock sessions</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>
              62%
            </span>
          </div>
        </div>

        <div className="chat-panel-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Mic size={14} style={{ color: 'var(--mod-interview)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Simulations</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 12 }}>
            Tailored to FAANG, Startups, or Enterprise standards.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Product Manager', 'Backend Dev', 'Data Analyst', 'Frontend Lead', '+2 more'].map(
              (c) => (
                <span
                  key={c}
                  style={{
                    padding: '3px 10px',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: 'var(--text-2)',
                    fontWeight: 500,
                  }}
                >
                  {c}
                </span>
              )
            )}
          </div>
        </div>

        <div className="chat-panel-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <BarChart3 size={14} style={{ color: 'var(--mod-content)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Communication</span>
          </div>
          <div
            className="chat-progress-track"
            style={{ background: 'rgba(61,106,122,0.12)', marginBottom: 6 }}
          >
            <div
              style={{
                height: '100%',
                width: '85%',
                borderRadius: '9999px',
                background: 'var(--mod-content)',
                transition: 'width 500ms var(--ease-out-expo)',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-3)' }}>clarity, structure, confidence</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>
              85%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
