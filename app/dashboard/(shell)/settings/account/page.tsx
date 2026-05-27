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
} from 'lucide-react'

export default function AccountPage() {
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const modules = localStorage.getItem('visible_modules')
        if (modules) {
          setVisibleModules(JSON.parse(modules))
        }
        const style = localStorage.getItem('sidebar_style') as 'spacious' | 'compact'
        if (style) {
          setSidebarStyle(style)
        }
        const defMod = localStorage.getItem('default_module')
        if (defMod) {
          setDefaultModule(defMod)
        }
      } catch (e) {
        console.error(e)
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
  const qPct = Math.round((Q_USED / Q_MAX) * 100)

  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)] transition-colors duration-300">
      <div className="mx-auto max-w-[680px] px-6 pb-20 pt-12 sm:px-8">
        
        {/* Header */}
        <div className="mb-10 border-b border-[var(--border)] pb-8">
          <h1
            className="text-[clamp(24px,2.8vw,32px)] leading-tight tracking-[-0.025em] text-[var(--text-1)] [font-family:var(--font-display)]"
            style={{ fontStyle: 'italic' }}
          >
            Settings
          </h1>
          <p className="mt-1.5 text-[14px] text-[var(--text-3)]">
            Manage your account usage, dashboard connectors, layout, and preferences.
          </p>
        </div>

        {/* Section: Connectors */}
        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Connectors
          </p>
          <p className="mb-5 text-xs text-[var(--text-2)]">
            Manage integrations with third-party messaging and email services.
          </p>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 space-y-5">
            {connectionStatus.error && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-5 flex-none mt-0.5 text-amber-500" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold">
                    {connectionStatus.error === "Auth gateway offline"
                      ? "Authentication Gateway Offline"
                      : "Gmail Connector Error"}
                  </p>
                  <p className="leading-relaxed opacity-90">
                    {connectionStatus.error === "Auth gateway offline"
                      ? "The auth gateway is currently unreachable. Please start it by running npm run dev:gateway in your terminal to enable Gmail features."
                      : connectionStatus.error}
                  </p>
                </div>
              </div>
            )}

            {/* Gmail Connector */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
              <div className="flex items-start gap-3.5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500 flex-none mt-0.5">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-1)]">Gmail Connector</h3>
                  <p className="text-xs text-[var(--text-2)] mt-1 leading-relaxed">
                    Fetch, summarize, and draft replies to your emails directly from WriteRight.
                  </p>
                  {connectionLoading ? (
                    <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--text-3)]">
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Syncing status...</span>
                    </div>
                  ) : connectionStatus.error ? (
                    <div className="mt-2.5 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={13} />
                      <span>
                        {connectionStatus.error === "Auth gateway offline"
                          ? "Gateway offline"
                          : connectionStatus.error}
                      </span>
                    </div>
                  ) : connectionStatus.connected && connectionStatus.connection ? (
                    <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1 text-xs text-[var(--text-2)] w-fit border border-[var(--border)]">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      <span>Connected as <span className="font-semibold text-[var(--text-1)]">{connectionStatus.connection.gmail_email}</span></span>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--text-3)]">
                      <div className="size-1.5 rounded-full bg-[var(--border-strong)]" />
                      <span>Not connected</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-none">
                {connectionStatus.connected ? (
                  <button
                    onClick={disconnect}
                    disabled={connectionLoading || connectionStatus.error === "Auth gateway offline"}
                    className="h-9 rounded-xl border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-1)] hover:bg-[var(--surface)] transition-colors disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={connect}
                    disabled={connectionLoading || connectionStatus.error === "Auth gateway offline"}
                    className="h-9 rounded-xl bg-[var(--accent)] px-4 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            {/* Outlook Connector */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
              <div className="flex items-start gap-3.5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 flex-none mt-0.5">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-1)] opacity-80">Microsoft Outlook</h3>
                  <p className="text-xs text-[var(--text-2)] mt-1 leading-relaxed">
                    Connect your Outlook mail to manage incoming messages.
                  </p>
                  <span className="mt-2.5 inline-block rounded-md bg-[var(--border)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    Coming Soon
                  </span>
                </div>
              </div>
              <button
                disabled
                className="h-9 rounded-xl border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-3)] bg-[var(--bg-subtle)] cursor-not-allowed opacity-50 flex-none"
              >
                Connect
              </button>
            </div>

            {/* Yahoo Connector */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 flex-none mt-0.5">
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-1)] opacity-80">Yahoo Mail</h3>
                  <p className="text-xs text-[var(--text-2)] mt-1 leading-relaxed">
                    Connect your Yahoo Mail account.
                  </p>
                  <span className="mt-2.5 inline-block rounded-md bg-[var(--border)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    Coming Soon
                  </span>
                </div>
              </div>
              <button
                disabled
                className="h-9 rounded-xl border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text-3)] bg-[var(--bg-subtle)] cursor-not-allowed opacity-50 flex-none"
              >
                Connect
              </button>
            </div>
          </div>
        </section>

        {/* Section: Dashboard Configuration */}
        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Dashboard Configuration
          </p>
          <p className="mb-5 text-xs text-[var(--text-2)]">
            Configure the layout, density, and modules displayed on your sidebar.
          </p>
          
          {/* Sidebar Layout Style */}
          <div className="mb-6">
            <label className="mb-2.5 block text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-3)]">
              Sidebar Layout Density
            </label>
            <div className="grid grid-cols-2 gap-3 max-w-[420px]">
              <button
                onClick={() => handleStyleChange('spacious')}
                className={cn(
                  "flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all",
                  sidebarStyle === 'spacious'
                    ? "border-[var(--accent)] bg-[var(--surface)] ring-1 ring-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--surface)]"
                )}
              >
                <div className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]">
                  <Layout size={15} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-1)]">Spacious</p>
                  <p className="text-[11px] text-[var(--text-2)] mt-0.5">Comfortable sizing</p>
                </div>
              </button>
              
              <button
                onClick={() => handleStyleChange('compact')}
                className={cn(
                  "flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all",
                  sidebarStyle === 'compact'
                    ? "border-[var(--accent)] bg-[var(--surface)] ring-1 ring-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--surface)]"
                )}
              >
                <div className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)]">
                  <Sliders size={15} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-1)]">Compact</p>
                  <p className="text-[11px] text-[var(--text-2)] mt-0.5">Space-saving density</p>
                </div>
              </button>
            </div>
          </div>

          {/* Module Visibility Switches */}
          <div>
            <label className="mb-3 block text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-3)]">
              Sidebar Modules Visibility
            </label>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 max-w-[480px]">
              {[
                { name: 'DevHelper', desc: 'Developer debugger and code explainer', color: 'var(--mod-dev)' },
                { name: 'StudyMate', desc: 'Academic helper and homework solver', color: 'var(--mod-study)' },
                { name: 'WriteRight', desc: 'Professional email & text editor', color: 'var(--mod-write)' },
                { name: 'InterviewPro', desc: 'Interview preparation and practice', color: 'var(--mod-interview)' },
                { name: 'ContentFlow', desc: 'Social media content repurposer', color: 'var(--mod-content)' },
              ].map((m, idx) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between py-3"
                  style={{ borderBottom: idx < 4 ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="size-2 rounded-full flex-none animate-pulse"
                      style={{ background: m.color }}
                    />
                    <div>
                      <p className="text-[13.5px] font-medium text-[var(--text-1)]">{m.name}</p>
                      <p className="text-[11px] text-[var(--text-2)] mt-0.5">{m.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleModule(m.name)}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      visibleModules[m.name] !== false ? "bg-[var(--accent)]" : "bg-[var(--border-med)]"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        visibleModules[m.name] !== false ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section: Plan & Usage */}
        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Plan & Usage
          </p>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div className="flex items-center gap-4">
              <span className="pbadge pbadge-free">Free</span>
              <div>
                <p className="text-[14px] font-medium text-[var(--text-1)]">
                  {Q_MAX - Q_USED} of {Q_MAX} queries left today
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="qmeter-track w-40 flex-none bg-[var(--border)]">
                    <div className="qmeter-fill" style={{ width: `${qPct}%` }} />
                  </div>
                  <span
                    className="text-[11px] text-[var(--text-3)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {qPct}%
                  </span>
                </div>
              </div>
            </div>
            <a
              href="/pricing"
              className="inline-flex h-9 items-center rounded-xl bg-[var(--accent)] px-4 text-[13px] font-semibold text-white no-underline transition-colors hover:bg-[var(--accent-hover)]"
            >
              Upgrade →
            </a>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <p className="text-[11px] font-medium text-[var(--text-3)]">All-time queries by module</p>
            </div>
            {modsUsage.map((m, i) => (
              <div
                key={m.label}
                className="flex items-center gap-4 px-5 py-3.5"
                style={{ borderBottom: i < modsUsage.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <span className="w-5 shrink-0 text-center text-[15px]">{m.emoji}</span>
                <span className="w-28 shrink-0 text-[13px] font-medium text-[var(--text-2)]">
                  {m.label}
                </span>
                <div className="ubar-track flex-1 bg-[var(--border)]">
                  <div className="ubar-fill" style={{ width: `${(m.n / total) * 100}%`, background: m.fill }} />
                </div>
                <span
                  className="w-8 shrink-0 text-right text-[13px] font-semibold text-[var(--text-1)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {m.n}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Section: Profile */}
        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Profile
          </p>
          <div className="flex max-w-[420px] flex-col gap-4">
            {[
              { l: 'Name', v: user?.fullName ?? '—' },
              { l: 'Email', v: user?.primaryEmailAddress?.emailAddress ?? '—' },
            ].map((f) => (
              <div key={f.l}>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-3)]">
                  {f.l}
                </label>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-[13.5px] text-[var(--text-2)]">
                  {f.v}
                </div>
              </div>
            ))}
            <p className="text-[12px] text-[var(--text-3)]">
              To update your profile,{' '}
              <a href="#" className="text-[var(--accent)] no-underline hover:underline">
                visit account settings
              </a>
              .
            </p>
          </div>
        </section>

        {/* Section: Preferences */}
        <section className="mb-10 border-b border-[var(--border)] pb-10">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Preferences
          </p>
          
          {/* Default module on login */}
          <div className="max-w-[420px] mb-6">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--text-3)]">
              Default module on login
            </label>
            <select
              value={defaultModule}
              onChange={(e) => handleDefaultModuleChange(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-xl border border-[var(--border-med)] bg-[var(--surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--text-1)] outline-none transition-colors focus:border-[var(--accent)]"
            >
              {['Overview', 'DevHelper', 'StudyMate', 'WriteRight', 'InterviewPro', 'ContentFlow'].map(
                (o) => (
                  <option key={o} value={o}>{o}</option>
                )
              )}
            </select>
          </div>

          {/* Theme Selection */}
          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
                <Moon size={14} className="text-[var(--text-2)]" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-[var(--text-1)]">Theme</p>
                <p className="text-[11px] text-[var(--text-3)]">Light, dark, or follow system</p>
              </div>
            </div>
            <ThemeSelector />
          </div>
        </section>

        {/* Section: Danger zone */}
        <section>
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-3)]">
            Danger zone
          </p>
          <button className="rounded-xl border border-[rgba(192,57,43,0.18)] bg-transparent px-4 py-2.5 text-[13px] font-medium text-[var(--error)] transition-colors hover:bg-[rgba(192,57,43,0.06)]">
            Delete account
          </button>
        </section>
      </div>
    </div>
  )
}
