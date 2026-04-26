"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, Zap, Globe, CreditCard } from "lucide-react";
import { BackgroundGradient } from "@/components/aceternity/background-gradient";

export function CTASection() {
  return (
    <section className="py-24 lg:py-32 relative flex justify-center bg-[color:var(--surface-50)]" data-section="cta">
      <div className="max-w-4xl mx-auto px-6 lg:px-16 w-full" data-reveal="cta">
        <BackgroundGradient className="bg-[color:var(--surface-card)] dark:bg-[color:var(--surface-solid)] rounded-[1.75rem] p-10 md:p-16 text-center shadow-[0_32px_64px_-32px_rgba(15,23,42,0.3)]">
          <h2 className="text-[48px] md:text-[56px] font-heading font-bold text-[color:var(--ink-900)] tracking-tight leading-tight mb-6">
            Start learning faster today.
          </h2>
          <p className="text-xl font-sans text-[color:var(--ink-700)] leading-relaxed max-w-2xl mx-auto mb-10">
            10 free queries/day, no credit card required. Experience the difference of an AI that actually teaches.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-12">
            <Button size="lg" className="w-full sm:w-auto h-16 px-10 rounded-[14px] text-lg font-bold bg-[linear-gradient(120deg,var(--brand-600),var(--brand-500))] text-white hover:opacity-90 shadow-lg shadow-[color:var(--brand-300)]/20 group">
              Get Started Free
              <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-16 px-10 rounded-[14px] text-lg font-semibold border-[color:var(--surface-300)] text-[color:var(--ink-800)] bg-[color:var(--surface-glass)] hover:bg-[color:var(--surface-200)] backdrop-blur-sm">
              Talk to Sales
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm font-medium text-[color:var(--ink-600)] items-center justify-center pt-8 border-t border-[color:var(--surface-200)]">
            <div className="flex items-center justify-center gap-2">
              <Lock className="w-4 h-4 text-[color:var(--brand-500)]" /> SOC2 Compliant
            </div>
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-4 h-4 text-[color:var(--accent-500)]" /> 99.9% Uptime
            </div>
            <div className="flex items-center justify-center gap-2">
              <Globe className="w-4 h-4 text-[color:var(--brand-600)]" /> 40+ Countries
            </div>
            <div className="flex items-center justify-center gap-2">
              <CreditCard className="w-4 h-4 text-[color:var(--accent-500)]" /> No Card Needed
            </div>
          </div>
        </BackgroundGradient>
      </div>
    </section>
  );
}
