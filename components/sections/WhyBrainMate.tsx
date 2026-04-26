'use client'

import React from 'react';
import { motion } from 'framer-motion';

const reasons = [
  {
    title: 'One subscription for everything.',
    description: 'Stop paying for multiple specialized AI tools. BrainMate unifies coding, writing, and studying under one predictable plan.',
  },
  {
    title: 'Cross-module intelligence.',
    description: 'Context flows seamlessly. BrainMate remembers your coding project when you switch to writing the documentation.',
  },
  {
    title: 'Designed for deep focus.',
    description: 'A completely distraction-free interface built to keep you in the flow state, without flashy animations or clutter.',
  },
];

export default function WhyBrainMate() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } 
    },
  };

  return (
    <section className="py-32 md:py-48 bg-[var(--surface-2)]">
      <div className="container max-w-5xl mx-auto px-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 lg:gap-32">
          
          {/* Left Column - Sticky Heading */}
          <div className="lg:pr-10">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="sticky top-32"
            >
              <h2 className="text-[32px] md:text-[44px] font-medium tracking-tight text-[var(--text-1)] leading-[1.1]" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Why BrainMate?
              </h2>
            </motion.div>
          </div>

          {/* Right Column - Content Nodes */}
          <motion.div 
            className="flex flex-col gap-16 md:gap-20"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {reasons.map((reason, idx) => (
              <motion.div key={idx} variants={itemVariants} className="group relative">
                <div className="text-[var(--text-3)] font-mono text-[11px] mb-5 tracking-[0.2em] font-semibold opacity-70">
                  0{idx + 1}
                </div>
                <h3 className="text-2xl md:text-[28px] font-medium tracking-tight text-[var(--text-1)] mb-4 md:mb-5 leading-tight">
                  {reason.title}
                </h3>
                <p className="text-[17px] md:text-[19px] text-[var(--text-2)] leading-[1.65] font-normal max-w-lg">
                  {reason.description}
                </p>
                
                {/* Subtle separator */}
                {idx !== reasons.length - 1 && (
                  <div className="hidden lg:block absolute -bottom-10 left-0 w-8 h-[1px] bg-[var(--border)] opacity-60" />
                )}
              </motion.div>
            ))}
          </motion.div>
          
        </div>
      </div>
    </section>
  );
}
