import type { ReactNode } from "react";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-8 flex flex-col items-center justify-center bg-[color:var(--background)]">
      <BackgroundBeams className="opacity-60 dark:opacity-40" />

      <div className="relative z-10 w-full max-w-md mx-auto">
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="font-heading font-bold text-2xl flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--brand-600)]">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
            BrainMate AI
          </Link>
          <h1 className="text-3xl font-heading font-semibold text-[color:var(--ink-900)] tracking-tight text-center">
            {title}
          </h1>
          <p className="mt-2 text-[color:var(--ink-600)] font-sans text-center">
             {subtitle}
          </p>
        </div>

        <section className="rounded-[1.75rem] border border-[color:var(--surface-strong)] bg-[color:var(--surface-card)] p-6 shadow-[0_32px_64px_-32px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:p-10 flex flex-col items-center">
          {children}
        </section>
      </div>
    </main>
  );
}
