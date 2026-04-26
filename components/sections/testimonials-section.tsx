"use client";
import React from "react";
import { AnimatedTestimonials } from "@/components/aceternity/animated-testimonials";
import { SectionLabel } from "@/components/shared/SectionLabel";

export function TestimonialsSection() {
  const testimonials = [
    {
      quote: "Before BrainMate, I'd stare at cryptic React errors for hours. Now, I paste the code, get an explanation in plain English, and learn why it failed. It's like having a senior dev on speed dial.",
      name: "Alex Rivera",
      designation: "Frontend Developer",
      src: "https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=256&q=80",
    },
    {
      quote: "The Mock Interview Coach is brutal but fair. It caught my habit of rambling during behavioral questions and helped me structure my answers. Landed my first junior role last week!",
      name: "Sarah Chen",
      designation: "CS Graduate, Bootcamp Alumni",
      src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=256&q=80",
    },
    {
      quote: "I use the Content Repurposer to turn my technical deep-dives into LinkedIn threads. It maintains my tone perfectly while optimizing for the platform. Saves me about 4 hours a week.",
      name: "Marcus Johnson",
      designation: "DevRel Engineer",
      src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=256&q=80",
    },
  ];

  return (
    <section className="py-24 lg:py-32 bg-[color:var(--surface-50)]" data-section="testimonials">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-6" data-reveal="testimonials">
          <SectionLabel>Wall of Love</SectionLabel>
          <h2 className="text-[48px] font-heading font-semibold text-[color:var(--ink-900)] tracking-tight leading-tight">
            What our users actually say.
          </h2>
          <p className="text-lg font-sans text-[color:var(--ink-700)] leading-relaxed">
            Real feedback from developers, students, and creators who use BrainMate daily.
          </p>
        </div>

        <div data-reveal="testimonials">
          <AnimatedTestimonials testimonials={testimonials} />
        </div>
      </div>
    </section>
  );
}
