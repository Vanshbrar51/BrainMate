'use client'

import Link from 'next/link'
import { Github, Linkedin, Twitter } from 'lucide-react'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden bg-[#0a0a0a] py-14 text-white" data-section="footer">
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-14" data-reveal="footer">
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2 text-white">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--brand-600)]">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
              <span className="text-[16px] font-semibold tracking-[-0.02em]">BrainMate AI</span>
            </Link>
            <p className="mt-4 text-[14px] leading-7 text-white/60">
              The AI product that explains clearly, stays lightweight, and helps you move through work with more confidence.
            </p>
            <div className="mt-5 flex gap-3.5">
              <a href="#" aria-label="Twitter" className="text-white/45 transition-colors hover:text-white/80">
                <Twitter className="h-[1.125rem] w-[1.125rem]" />
              </a>
              <a href="#" aria-label="LinkedIn" className="text-white/45 transition-colors hover:text-white/80">
                <Linkedin className="h-[1.125rem] w-[1.125rem]" />
              </a>
              <a href="#" aria-label="GitHub" className="text-white/45 transition-colors hover:text-white/80">
                <Github className="h-[1.125rem] w-[1.125rem]" />
              </a>
            </div>
          </div>

          {[
            {
              title: 'Product',
              items: ['Bug Explainer', 'Homework Solver', 'Writing Assistant', 'Mock Interview'],
            },
            {
              title: 'Company',
              items: ['About Us', 'Blog', 'Careers', 'Press Kit'],
            },
            {
              title: 'Legal',
              items: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Contact Support'],
            },
          ].map((group) => (
            <div key={group.title}>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{group.title}</h4>
              <ul className="mt-5 space-y-3.5">
                {group.items.map((item) => (
                  <li key={item}>
                    <Link href="#" className="text-[14px] text-white/58 transition-colors hover:text-white/84">
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-5 text-[12px] text-white/45 md:flex-row md:items-center md:justify-between" data-reveal="footer">
          <p>© {currentYear} BrainMate AI</p>
          <p>Designed for calm, focused work.</p>
        </div>
      </div>
    </footer>
  )
}
