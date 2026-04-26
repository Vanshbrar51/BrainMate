"use client";
import React from "react";
import { HoverEffect } from "@/components/aceternity/hover-effect";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { Copy, Brain, Cpu, Rocket } from "lucide-react";

export function HowItWorksSection() {
  const steps = [
    {
      title: "Capture",
      description: "Paste your error log, bug, or specific question directly.",
      link: "#capture",
      step: "01",
      icon: <Copy className="w-8 h-8" />,
    },
    {
      title: "Reason",
      description: "BrainMate parses context, identifies the core issue.",
      link: "#reason",
      step: "02",
      icon: <Brain className="w-8 h-8" />,
    },
    {
      title: "Coach",
      description: "It explains the why, provides a fix, and teaches concepts.",
      link: "#coach",
      step: "03",
      icon: <Cpu className="w-8 h-8" />,
    },
    {
      title: "Scale",
      description: "Apply your new knowledge to build better, faster code.",
      link: "#scale",
      step: "04",
      icon: <Rocket className="w-8 h-8" />,
    },
  ];

  return (
    <section className="py-24 lg:py-32 bg-[color:var(--surface-50)]" data-section="how-it-works">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-6" data-reveal="how">
          <SectionLabel>Workflow</SectionLabel>
          <h2 className="text-[48px] font-heading font-semibold text-[color:var(--ink-900)] tracking-tight leading-tight">
            How BrainMate actually works.
          </h2>
          <p className="text-lg font-sans text-[color:var(--ink-700)] leading-relaxed">
             A simple 4-step loop to turn frustrating bugs into long-term learning.
          </p>
        </div>

        <div data-reveal="how">
           <HoverEffect items={steps} />
        </div>
      </div>
    </section>
  );
}
