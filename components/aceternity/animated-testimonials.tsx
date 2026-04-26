"use client";
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const AnimatedTestimonials = ({
  testimonials,
}: {
  testimonials: {
    quote: string;
    name: string;
    designation: string;
    src: string;
  }[];
}) => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  return (
    <div className="relative overflow-hidden w-full flex items-center justify-center p-10">
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-4"
        >
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[color:var(--brand-300)] mb-4">
            <img src={testimonials[active].src} alt={testimonials[active].name} className="object-cover w-full h-full" />
          </div>
          <h3 className="text-2xl font-heading font-semibold text-[color:var(--ink-900)] italic">
            &quot;{testimonials[active].quote}&quot;
          </h3>
          <div className="flex flex-col items-center">
            <span className="font-sans font-bold text-lg text-[color:var(--ink-800)]">{testimonials[active].name}</span>
            <span className="font-sans text-sm text-[color:var(--ink-600)]">{testimonials[active].designation}</span>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="absolute bottom-4 flex gap-2">
        {testimonials.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              active === i ? "w-6 bg-[color:var(--brand-600)]" : "bg-[color:var(--surface-300)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
