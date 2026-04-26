"use client";
import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { TextGenerateEffect } from "@/components/aceternity/text-generate-effect";
import { CardSpotlight } from "@/components/aceternity/glowing-card";
import { AnimatedCounter } from "@/components/shared/AnimatedCounter";
import { GradientText } from "@/components/shared/GradientText";
import { ArrowRight, Code2, Bot } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] flex items-center pt-32 pb-24 overflow-hidden" data-section="hero">
      <BackgroundBeams />

      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 relative z-10 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
        {/* Left Column: Copy */}
        <div className="space-y-8" data-reveal="hero">
          <Badge variant="neutral" className="bg-[color:var(--surface-glass)] backdrop-blur-md border-[color:var(--surface-strong)] text-[color:var(--ink-800)] px-3 py-1 text-sm font-medium">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[color:var(--brand-600)] animate-pulse" />
              5 AI Tools. One Platform. Zero Fluff.
            </span>
          </Badge>

          <h1 className="text-[56px] lg:text-[76px] font-heading font-bold leading-[1.04] tracking-tight text-[color:var(--ink-900)] max-w-2xl">
            <TextGenerateEffect words="The AI that teaches, not just answers." duration={0.8} />
          </h1>

          <p className="text-lg lg:text-xl font-sans text-[color:var(--ink-700)] leading-relaxed max-w-xl">
            Stop pasting code into generic chat boxes. Get pinpoint explanations,
            fix bugs in seconds, and actually learn the concepts you&apos;re missing.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <Button size="lg" className="bg-[linear-gradient(120deg,var(--brand-600),var(--brand-500))] text-white hover:opacity-90 transition-opacity h-14 px-8 rounded-[14px] text-base font-semibold group">
              Start Free — 10 queries/day
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 rounded-[14px] text-base font-semibold border-[color:var(--surface-300)] bg-[color:var(--surface-glass)] hover:bg-[color:var(--surface-200)] backdrop-blur-sm">
              Watch 90s demo
            </Button>
          </div>

          <p className="text-sm font-sans text-[color:var(--ink-600)] flex items-center gap-2">
             Trusted by 220K+ learners · No credit card · Cancel anytime
          </p>

          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 border-t border-[color:var(--surface-200)]">
            {[
              { label: "Learners", value: 220, suffix: "K+" },
              { label: "Prod. Lift", value: 67, suffix: "%" },
              { label: "Bug Speed", value: 3, suffix: ".2x" },
              { label: "Output Scale", value: 4, suffix: ".8x" },
            ].map((metric, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-2xl font-heading font-bold text-[color:var(--ink-900)]">
                  <AnimatedCounter value={metric.value} />
                  {metric.suffix}
                </span>
                <span className="text-xs font-sans text-[color:var(--ink-600)] uppercase tracking-wider font-semibold">
                  {metric.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Visual */}
        <div className="relative" data-reveal="hero">
           <CardSpotlight className="p-6 md:p-8 relative z-10 flex flex-col gap-6">
             {/* Fake UI */}
             <div className="flex items-center gap-3 border-b border-[color:var(--surface-200)] pb-4">
                <div className="w-10 h-10 rounded-full bg-[color:var(--surface-200)] flex items-center justify-center">
                   <Code2 className="w-5 h-5 text-[color:var(--ink-700)]" />
                </div>
                <div className="flex-1">
                   <div className="h-2 w-24 bg-[color:var(--surface-300)] rounded-full mb-2"></div>
                   <div className="h-2 w-48 bg-[color:var(--surface-200)] rounded-full"></div>
                </div>
             </div>

             {/* Code Block Snippet */}
             <div className="bg-[color:var(--surface-100)] dark:bg-[color:var(--surface-200)] rounded-xl p-4 border border-[color:var(--surface-300)] font-mono text-sm text-[color:var(--ink-700)] overflow-x-hidden">
                <span className="text-[color:var(--accent-500)]">function</span> fibonacci(n) {'{'}<br/>
                &nbsp;&nbsp;<span className="text-[color:var(--brand-600)]">if</span> (n {'<='} 1) <span className="text-[color:var(--accent-500)]">return</span> n;<br/>
                &nbsp;&nbsp;<span className="text-[color:var(--brand-600)]">return</span> fibonacci(n - 1) + fibonacci(n - 2);<br/>
                {'}'}
             </div>

             <div className="flex gap-4">
               <div className="w-8 h-8 rounded-full bg-[color:var(--brand-100)] flex items-center justify-center flex-shrink-0">
                 <Bot className="w-4 h-4 text-[color:var(--brand-600)]" />
               </div>
               <div className="bg-[color:var(--brand-50)] dark:bg-[color:var(--surface-300)] p-4 rounded-xl rounded-tl-sm border border-[color:var(--brand-200)] dark:border-[color:var(--surface-strong)] flex-1 text-sm text-[color:var(--ink-800)]">
                  <p className="mb-2 font-medium"><GradientText>Performance Warning:</GradientText></p>
                  <p>This recursive approach has an exponential time complexity O(2^n). Let&apos;s optimize it using memoization.</p>
               </div>
             </div>
           </CardSpotlight>

           {/* Floating Badges */}
           <motion.div
             animate={{ y: [-10, 10, -10] }}
             transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
             className="absolute -right-6 top-12 z-20 bg-[color:var(--surface-solid)] border border-[color:var(--surface-300)] shadow-lg rounded-full px-4 py-2 flex items-center gap-2"
           >
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs font-semibold text-[color:var(--ink-800)]">98.2% Confidence</span>
           </motion.div>

           <motion.div
             animate={{ y: [10, -10, 10] }}
             transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
             className="absolute -left-8 bottom-16 z-20 bg-[color:var(--surface-solid)] border border-[color:var(--surface-300)] shadow-lg rounded-full px-4 py-2 flex items-center gap-2"
           >
              <span className="text-xs font-semibold text-[color:var(--ink-800)]">Adaptive Coaching Active</span>
           </motion.div>
        </div>
      </div>
    </section>
  );
}
