'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { ThemeSelector } from '@/components/ui/ThemeSelector'
import { useGmailIntegration } from '@/hooks/useGmailIntegration'
import { cn } from '@/lib/utils'
import {
  Moon,
  Mail,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  User,
  Layout,
  Check,
  RefreshCw,
  Plus,
  Settings2,
  MoreHorizontal
} from 'lucide-react'

export default function SettingsPage() {
  const { user } = useUser()
  const { connectionStatus, connectionLoading, connect, disconnect } = useGmailIntegration()

  const [visibleModules, setVisibleModules] = useState<Record<string, boolean>>({
    DevHelper: true,
    StudyMate: true,
    WriteRight: true,
    InterviewPro: true,
    ContentFlow: true,
  })
  const [sidebarStyle, setSidebarStyle] = useState<'spacious' | 'compact'>('spacious')
  const [defaultModule, setDefaultModule] = useState('Overview')
  const [showAdvancedConnectors, setShowAdvancedConnectors] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const modules = localStorage.getItem('visible_modules')
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (modules) setVisibleModules(JSON.parse(modules))
        
        const style = localStorage.getItem('sidebar_style') as 'spacious' | 'compact'

        if (style) setSidebarStyle(style)
        
        const defMod = localStorage.getItem('default_module')

        if (defMod) setDefaultModule(defMod)
      } catch (e) {

      }
    }
  }, [])

  const handleToggleModule = (modName: string) => {
    const updated = { ...visibleModules, [modName]: visibleModules[modName] === false }
    setVisibleModules(updated)
    localStorage.setItem('visible_modules', JSON.stringify(updated))
    window.dispatchEvent(new Event('sidebar-config-changed'))
  }

  const handleStyleChange = (style: 'spacious' | 'compact') => {
    setSidebarStyle(style)
    localStorage.setItem('sidebar_style', style)
    window.dispatchEvent(new Event('sidebar-config-changed'))
  }

  const handleDefaultModuleChange = (val: string) => {
    setDefaultModule(val)
    localStorage.setItem('default_module', val)
  }

  const modsUsage = [
    { label: 'DevHelper', emoji: '🐛', n: 42, fill: 'var(--mod-dev)', bg: 'var(--mod-dev-bg)' },
    { label: 'StudyMate', emoji: '📚', n: 28, fill: 'var(--mod-study)', bg: 'var(--mod-study-bg)' },
    { label: 'WriteRight', emoji: '✍️', n: 19, fill: 'var(--mod-write)', bg: 'var(--mod-write-bg)' },
    { label: 'InterviewPro', emoji: '🎤', n: 14, fill: 'var(--mod-interview)', bg: 'var(--mod-interview-bg)' },
    { label: 'ContentFlow', emoji: '🔁', n: 7, fill: 'var(--mod-content)', bg: 'var(--mod-content-bg)' },
  ]
  const total = modsUsage.reduce((s, m) => s + m.n, 0)
  const Q_USED = 3
  const Q_MAX = 10

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] transition-colors duration-300 relative">
      <div className="mx-auto max-w-[728px] px-6 pb-32 pt-12 sm:px-8 relative z-10">
        
        {/* Header - Signature serif heading */}
        <div className="mb-12 pb-6 border-b border-[var(--border)]">
          <h1
            className="text-[clamp(30px,3.8vw,46px)] font-normal tracking-[-0.025em] text-[var(--text-1)] [font-family:var(--font-display)]"
          >
            Settings & Integrations
          </h1>
          <p className="mt-2 text-[14.5px] text-[var(--text-2)] leading-relaxed max-w-lg">
            Manage your external connectors, customize your workspace layout, and adjust preferences to tailor your environment.
          </p>
        </div>

        {/* Section: Connectors */}
        <section className="mb-14">
          <header className="mb-6">
            <h2 className="text-[16px] font-semibold text-[var(--text-1)]">Connectors</h2>
            <p className="text-[13px] text-[var(--text-3)] mt-1">
              Link external services to bring context and drafting capabilities into your AI assistant.
            </p>
          </header>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[16px] overflow-hidden shadow-[0_1px_3px_rgba(26,23,19,0.04),_0_4px_14px_rgba(26,23,19,0.06)] transition-all duration-300">
            {connectionStatus.error && (
              <div className="m-4 flex items-start gap-3 rounded-[12px] border-l-2 border-l-amber-500 bg-amber-500/5 p-4 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-4 flex-none mt-0.5 text-amber-500" />
                <div className="text-[13px] space-y-1">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    {connectionStatus.error === "Auth gateway offline"
                      ? "Authentication Gateway Offline"
                      : "Gmail Connector Error"}
                  </p>
                  <p className="opacity-90 leading-relaxed">
                    {connectionStatus.error === "Auth gateway offline"
                      ? "The auth gateway is currently unreachable. Please start it by running npm run dev:gateway in your terminal to enable Gmail features."
                      : connectionStatus.error}
                  </p>
                </div>
              </div>
            )}

            {/* Gmail Connector Row */}
            <div className="flex items-center justify-between gap-4 p-5 hover:bg-[var(--bg-subtle)] transition-colors duration-150">
              <div className="flex items-center gap-4">
                <div className="flex size-11 items-center justify-center rounded-[10px] bg-red-500/10 text-red-500 flex-none border border-red-500/10">
                  <Mail size={22} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-[14.5px] font-medium text-[var(--text-1)] flex items-center gap-2">
                    Gmail 
                    {connectionStatus.connected && connectionStatus.connection && (
                      <span className="flex items-center gap-1.5 rounded-full bg-[var(--success-ring)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]">
                        <CheckCircle2 size={12} /> Active
                      </span>
                    )}
                  </h3>
                  <p className="text-[13px] text-[var(--text-2)] mt-0.5">
                    {connectionStatus.connected && connectionStatus.connection 
                      ? `Connected as ${connectionStatus.connection.gmail_email}` 
                      : 'Draft replies and summarize threads directly from WriteRight.'}
                  </p>
                </div>
              </div>
              <div className="flex-none">
                {connectionLoading ? (
                  <div className="flex items-center justify-center h-8 w-[92px] rounded-[20px] bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-3)]">
                    <RefreshCw size={14} className="animate-spin" />
                  </div>
                ) : connectionStatus.connected ? (
                  <button
                    onClick={disconnect}
                    disabled={connectionStatus.error === "Auth gateway offline"}
                    className="h-8 px-4 rounded-[20px] bg-transparent border border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-2)] hover:bg-[rgba(26,23,19,0.06)] hover:text-[var(--text-1)] transition-all duration-150 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={connect}
                    disabled={connectionStatus.error === "Auth gateway offline"}
                    className="h-8 px-4 rounded-[20px] bg-[var(--text-1)] text-[var(--bg)] text-[13px] font-medium hover:bg-[var(--text-2)] transition-all duration-150 disabled:opacity-50 flex items-center gap-2"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            {/* Progressive Disclosure for Advanced Connectors */}
            {showAdvancedConnectors ? (
              <div className="border-t border-[var(--border-faint)] bg-[var(--bg-canvas)] animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between gap-4 p-5 opacity-60 grayscale-[50%]">
                  <div className="flex items-center gap-4">
                    <div className="flex size-11 items-center justify-center rounded-[10px] bg-blue-500/10 text-blue-500 flex-none border border-blue-500/10">
                      <Mail size={22} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="text-[14.5px] font-medium text-[var(--text-1)]">Microsoft Outlook</h3>
                      <p className="text-[13px] text-[var(--text-2)] mt-0.5">Coming Soon — Enterprise mail integration</p>
                    </div>
                  </div>
                  <button disabled className="h-8 px-4 rounded-[20px] bg-[var(--bg-subtle)] border border-[var(--border-faint)] text-[13px] font-medium text-[var(--text-4)] cursor-not-allowed">
                    Connect
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-t border-[var(--border-faint)] p-3 flex justify-center bg-[var(--bg-canvas)]">
                <button 
                  onClick={() => setShowAdvancedConnectors(true)}
                  className="h-7 px-3 rounded-full flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[rgba(26,23,19,0.04)] transition-colors"
                >
                  <Plus size={14} /> Show more connectors
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Section: Dashboard Configuration */}
        <section className="mb-14">
          <header className="mb-6">
            <h2 className="text-[16px] font-semibold text-[var(--text-1)]">Layout & Modules</h2>
            <p className="text-[13px] text-[var(--text-3)] mt-1">
              Customize the density and visibility of sidebar items to fit your workflow.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Sidebar Density */}
            <div>
              <p className="text-[12px] font-medium text-[var(--text-2)] mb-3 flex items-center gap-2">
                <Layout size={14} /> Sidebar Density
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => handleStyleChange('spacious')}
                  className={cn(
                    "flex items-center justify-between p-3.5 rounded-[12px] border transition-all duration-150 text-left",
                    sidebarStyle === 'spacious'
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--border-soft)] bg-[var(--surface)] hover:border-[var(--border-medium)]"
                  )}
                >
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text-1)]">Spacious</p>
                    <p className="text-[11.5px] text-[var(--text-3)] mt-0.5">Comfortable padding and larger text</p>
                  </div>
                  <div className={cn("size-4 rounded-full border flex items-center justify-center transition-colors", sidebarStyle === 'spacious' ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)] bg-transparent")}>
                    {sidebarStyle === 'spacious' && <div className="size-1.5 bg-[var(--bg)] rounded-full" />}
                  </div>
                </button>
                <button
                  onClick={() => handleStyleChange('compact')}
                  className={cn(
                    "flex items-center justify-between p-3.5 rounded-[12px] border transition-all duration-150 text-left",
                    sidebarStyle === 'compact'
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--border-soft)] bg-[var(--surface)] hover:border-[var(--border-medium)]"
                  )}
                >
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text-1)]">Compact</p>
                    <p className="text-[11.5px] text-[var(--text-3)] mt-0.5">Denser list to view more items at once</p>
                  </div>
                  <div className={cn("size-4 rounded-full border flex items-center justify-center transition-colors", sidebarStyle === 'compact' ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)] bg-transparent")}>
                    {sidebarStyle === 'compact' && <div className="size-1.5 bg-[var(--bg)] rounded-full" />}
                  </div>
                </button>
              </div>
            </div>

            {/* Module Toggles */}
            <div>
              <p className="text-[12px] font-medium text-[var(--text-2)] mb-3 flex items-center gap-2">
                <Settings2 size={14} /> Active Modules
              </p>
              <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[12px] p-2">
                {[
                  { name: 'DevHelper', color: 'var(--mod-dev)' },
                  { name: 'StudyMate', color: 'var(--mod-study)' },
                  { name: 'WriteRight', color: 'var(--mod-write)' },
                  { name: 'InterviewPro', color: 'var(--mod-interview)' },
                  { name: 'ContentFlow', color: 'var(--mod-content)' },
                ].map((m, idx) => (
                  <div key={m.name} className="flex items-center justify-between px-3 py-2.5 rounded-[8px] hover:bg-[var(--bg-hover)] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="size-2 rounded-full" style={{ background: m.color }} />
                      <p className="text-[13px] font-medium text-[var(--text-1)]">{m.name}</p>
                    </div>
                    <button
                      onClick={() => handleToggleModule(m.name)}
                      className={cn(
                        "relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        visibleModules[m.name] !== false ? "bg-[var(--text-1)]" : "bg-[var(--border-strong)]"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block size-[16px] transform rounded-full bg-[var(--bg)] shadow-sm transition duration-200 ease-in-out",
                          visibleModules[m.name] !== false ? "translate-x-4" : "translate-x-[2px]"
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section: Preferences */}
        <section className="mb-14">
          <header className="mb-6">
            <h2 className="text-[16px] font-semibold text-[var(--text-1)]">Preferences</h2>
          </header>

          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[16px] p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--border-faint)]">
              <div>
                <p className="text-[14.5px] font-medium text-[var(--text-1)]">Default startup module</p>
                <p className="text-[13px] text-[var(--text-3)] mt-0.5">Which tool should open when you log in.</p>
              </div>
              <select
                value={defaultModule}
                onChange={(e) => handleDefaultModuleChange(e.target.value)}
                className="h-9 px-3.5 pr-8 rounded-[8px] border border-[var(--border-medium)] bg-[var(--bg)] text-[13px] font-medium text-[var(--text-1)] focus:border-[var(--accent)] outline-none cursor-pointer appearance-none"
                style={{ background: 'var(--bg) url("data:image/svg+xml;utf8,<svg fill=\'none\' stroke=\'%236B6358\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\' viewBox=\'0 0 24 24\' xmlns=\'http://www.w3.org/2000/svg\'><path d=\'m6 9 6 6 6-6\'/></svg>") no-repeat right 10px center / 14px' }}
              >
                {['Overview', 'DevHelper', 'StudyMate', 'WriteRight', 'InterviewPro', 'ContentFlow'].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center justify-between gap-4 pt-5">
              <div className="flex items-center gap-3.5">
                <div className="flex size-9 items-center justify-center rounded-[8px] bg-[var(--bg-subtle)] border border-[var(--border-faint)]">
                  <Moon size={16} className="text-[var(--text-2)]" />
                </div>
                <div>
                  <p className="text-[14.5px] font-medium text-[var(--text-1)]">Theme Appearance</p>
                  <p className="text-[13px] text-[var(--text-3)] mt-0.5">Choose between light, dark, or system.</p>
                </div>
              </div>
              <ThemeSelector />
            </div>
          </div>
        </section>

        {/* Section: Plan & Usage */}
        <section className="mb-14">
          <header className="mb-6">
            <h2 className="text-[16px] font-semibold text-[var(--text-1)]">Plan & Usage</h2>
          </header>
          
          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[16px] overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b border-[var(--border-faint)] bg-[var(--bg-canvas)]">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-[22px] items-center px-2.5 rounded-full border border-[var(--border-strong)] text-[11px] font-medium text-[var(--text-2)] bg-[var(--bg-subtle)]">
                  Free Tier
                </span>
                <div>
                  <p className="text-[13.5px] font-medium text-[var(--text-1)]">
                    {Q_MAX - Q_USED} of {Q_MAX} queries remaining today
                  </p>
                </div>
              </div>
              <a href="/pricing" className="h-8 px-4 rounded-[20px] bg-[var(--accent)] text-white text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-all duration-150 inline-flex items-center">
                Upgrade Plan
              </a>
            </div>

            <div className="p-2">
              {modsUsage.map((m, i) => (
                <div key={m.label} className="flex items-center gap-4 px-4 py-3 rounded-[8px] hover:bg-[var(--bg-hover)] transition-colors">
                  <span className="w-5 text-center text-[15px]">{m.emoji}</span>
                  <span className="w-24 text-[13px] font-medium text-[var(--text-2)]">{m.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-warm)] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${(m.n / total) * 100}%`, background: m.fill }} />
                  </div>
                  <span className="w-8 text-right text-[12px] font-medium text-[var(--text-3)] font-mono">{m.n}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
      
      {/* Decorative gradient overlay at the bottom for scroll effect */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[var(--bg)] to-transparent pointer-events-none z-20" />
    </div>
  )
}
