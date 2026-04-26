"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Orbit, Sparkles } from "lucide-react";
import { useClerk, useAuth } from "@clerk/nextjs";

import { ThemeSelector } from "@/components/ui/ThemeSelector";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/", label: "Landing" },
  { href: "/#pricing", label: "Pricing" },
];

export function SpecialNavbar() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  async function handleSignOut() {
    try {
      // Tell the Rust gateway to revoke the session + blacklist the JWT
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Don't block sign-out if gateway call fails
    }
    // Sign out of Clerk and redirect
    await signOut({ redirectUrl: "/" });
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-4 z-40 mt-6"
    >
      <div className="relative overflow-hidden rounded-[1.5rem] border border-[color:var(--surface-strong)] bg-[color:var(--surface-glass)] p-2 shadow-[0_26px_44px_-28px_rgba(15,23,42,0.65)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-12 -top-10 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(29,78,216,0.3),rgba(29,78,216,0))]" />
        <div className="pointer-events-none absolute -left-8 bottom-[-20px] h-20 w-20 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.28),rgba(16,185,129,0))]" />

        <div className="relative flex flex-wrap items-center justify-between gap-2 rounded-[1.15rem] border border-[color:var(--surface-strong)] bg-[color:var(--surface-card)] px-3 py-2 sm:px-4">
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl px-2 py-1">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand-600)] text-white">
              <Orbit size={15} />
            </span>
            <span className="text-sm font-semibold tracking-tight">BrainMate AI</span>
          </Link>

          <nav className="order-3 flex w-full items-center justify-center gap-1 rounded-xl border border-[color:var(--surface-strong)] bg-[color:var(--surface-glass)] p-1 md:order-none md:w-auto">
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-200)] hover:text-[var(--ink-900)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeSelector />
            {isLoaded && isSignedIn ? (
              <>
                <Button asChild size="sm" variant="secondary" className="rounded-xl">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
                <Button size="sm" className="rounded-xl" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="rounded-xl">
                <Link href="/sign-in">
                  <Sparkles size={14} className="mr-1.5" />
                  Get Started
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  );
}
