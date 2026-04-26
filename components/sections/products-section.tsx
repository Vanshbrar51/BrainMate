"use client";
import React from "react";
import { BentoGrid, BentoGridItem } from "@/components/aceternity/bento-grid";
import { SectionLabel } from "@/components/shared/SectionLabel";
import { Bug, BookOpenCheck, Edit3, UserCheck, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardSpotlight } from "@/components/aceternity/glowing-card";

export function ProductsSection() {
  const items = [
    {
      title: "AI Bug Explainer & Code Review",
      description: "Paste code or errors. BrainMate explains the bug in simple English, fixes it, and teaches the why.",
      header: (
        <CardSpotlight className="h-full min-h-[12rem] w-full rounded-xl bg-gradient-to-br from-neutral-200 to-neutral-100 dark:from-neutral-900 dark:to-neutral-800 border-none p-4 flex flex-col justify-end">
          <Badge className="w-fit mb-auto bg-[color:var(--brand-600)] text-white font-semibold">Top Pick</Badge>
          <div className="font-mono text-xs opacity-50 bg-[color:var(--surface-300)] p-2 rounded-md">
            TypeError: undefined is not a function
          </div>
        </CardSpotlight>
      ),
      icon: <Bug className="w-8 h-8 text-[color:var(--brand-600)]" />,
      className: "md:col-span-2 relative",
    },
    {
      title: "AI Homework Solver",
      description: "Upload questions, get step-by-step guidance. Never just the final answer.",
      header: (
        <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-[color:var(--surface-200)] to-[color:var(--surface-100)] dark:from-[color:var(--surface-300)] dark:to-[color:var(--surface-200)] border border-[color:var(--surface-300)] items-center justify-center relative overflow-hidden">
           <BookOpenCheck className="w-16 h-16 opacity-10 absolute -right-4 -bottom-4 text-[color:var(--ink-900)]" />
        </div>
      ),
      icon: <BookOpenCheck className="w-8 h-8 text-[color:var(--accent-500)]" />,
      className: "md:col-span-1",
    },
    {
      title: "Writing Assistant",
      description: "Refines essays, emails, and documentation while maintaining your personal tone.",
      header: <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-[color:var(--surface-200)] border border-[color:var(--surface-300)]" />,
      icon: <Edit3 className="w-8 h-8 text-[color:var(--brand-500)]" />,
      className: "md:col-span-1",
    },
    {
      title: "Mock Interview Coach",
      description: "Simulates technical and behavioral interviews with real-time feedback and scoring.",
      header: <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-[color:var(--surface-200)] border border-[color:var(--surface-300)]" />,
      icon: <UserCheck className="w-8 h-8 text-[color:var(--accent-700)]" />,
      className: "md:col-span-1",
    },
    {
      title: "Content Repurposer",
      description: "Turn one long-form blog post into tweets, LinkedIn posts, and newsletter snippets instantly.",
      header: <div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-[color:var(--surface-200)] border border-[color:var(--surface-300)]" />,
      icon: <RefreshCw className="w-8 h-8 text-[color:var(--brand-600)]" />,
      className: "md:col-span-1",
    },
  ];

  return (
    <section className="py-24 lg:py-32 relative" data-section="products">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-6" data-reveal="products">
          <SectionLabel>Product Suite</SectionLabel>
          <h2 className="text-[48px] font-heading font-semibold text-[color:var(--ink-900)] tracking-tight leading-tight">
            Five tools. One mission: make you better.
          </h2>
          <p className="text-lg font-sans text-[color:var(--ink-700)] leading-relaxed">
            Not a Swiss army knife — a laser-focused toolkit for the exact moments you need AI help.
          </p>
        </div>

        <BentoGrid className="max-w-6xl mx-auto" data-reveal="products">
          {items.map((item, i) => (
            <BentoGridItem
              key={i}
              title={item.title}
              description={
                <>
                  <span className="block mb-4">{item.description}</span>
                  <span className="text-[10px] font-mono opacity-50 block">Free 10/day · ₹199/mo unlimited</span>
                </>
              }
              header={item.header}
              icon={item.icon}
              className={item.className}
            />
          ))}
        </BentoGrid>
      </div>
    </section>
  );
}
