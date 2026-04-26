'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ThemeSelector } from '@/components/ui/ThemeSelector'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { isSignedIn } = useAuth()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[100] transition-all duration-500 ${
        scrolled ? 'pt-3' : 'pt-4 md:pt-5'
      }`}
    >
      <div
        className={`container flex h-14 max-w-[1120px] items-center justify-between rounded-full border px-4 md:px-5 ${
          scrolled
            ? 'backdrop-blur-xl'
            : 'border-transparent bg-transparent'
        }`}
        style={
          scrolled
            ? {
                background: 'var(--nav-bg)',
                borderColor: 'var(--nav-border)',
                boxShadow: 'var(--nav-shadow)',
              }
            : undefined
        }
      >
        <Link href="/" className="flex items-center gap-2.5 text-[var(--text-1)] transition-opacity hover:opacity-80">
          <div className="flex h-5 w-5 items-center justify-center rounded-[7px] border border-[var(--text-1)]">
            <div className="h-2 w-2 rounded-full bg-[var(--text-1)]" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">BrainMate</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[13px] font-medium text-[var(--text-2)] transition-colors duration-300 hover:text-[var(--accent)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <ThemeSelector />
          {isSignedIn ? (
            <Link
              href="/dashboard"
              className="hidden rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-semibold text-[var(--text-1)] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-transform duration-300 hover:scale-[1.02] sm:inline-flex"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="hidden text-[13px] font-medium text-[var(--text-2)] transition-colors duration-300 hover:text-[var(--text-1)] md:inline-flex"
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="hidden rounded-full bg-[var(--text-1)] px-4 py-2 text-[13px] font-semibold text-[var(--text-inv)] shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-transform duration-300 hover:scale-[1.02] sm:inline-flex"
              >
                Start free
              </Link>
            </>
          )}

          <button
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-1)] backdrop-blur-sm md:hidden"
            aria-label="Toggle menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <motion.path animate={menuOpen ? { d: 'M18 6L6 18' } : { d: 'M4 7h16' }} transition={{ duration: 0.24 }} />
              <motion.path animate={menuOpen ? { d: 'M6 6l12 12' } : { d: 'M4 12h16' }} transition={{ duration: 0.24 }} />
              <motion.path animate={menuOpen ? { opacity: 0 } : { opacity: 1, d: 'M4 17h16' }} transition={{ duration: 0.24 }} />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="container mt-3 md:hidden"
          >
            <div
              className="rounded-[24px] border border-[var(--border)] p-3 backdrop-blur-xl"
              style={{
                background: 'var(--nav-bg)',
                borderColor: 'var(--nav-border)',
                boxShadow: 'var(--nav-shadow)',
              }}
            >
              <div className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-2xl px-4 py-3 text-[14px] font-medium text-[var(--text-2)] transition-colors duration-300 hover:bg-[var(--surface)] hover:text-[var(--text-1)]"
                  >
                    {link.label}
                  </Link>
                ))}
                {!isSignedIn && (
                  <>
                    <Link
                      href="/sign-in"
                      onClick={() => setMenuOpen(false)}
                      className="rounded-2xl px-4 py-3 text-[14px] font-medium text-[var(--text-2)] transition-colors duration-300 hover:bg-[var(--surface)] hover:text-[var(--text-1)]"
                    >
                      Log in
                    </Link>
                    <Link
                      href="/sign-up"
                      onClick={() => setMenuOpen(false)}
                      className="mt-1 inline-flex items-center justify-center rounded-2xl bg-[var(--text-1)] px-4 py-3 text-[14px] font-semibold text-[var(--text-inv)]"
                    >
                      Start free
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
