"use client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

export const HoverEffect = ({
  items,
  className,
}: {
  items: {
    title: string;
    description: string;
    link: string;
    step?: string;
    icon?: React.ReactNode;
  }[];
  className?: string;
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 py-10 gap-5 relative",
        className
      )}
    >
      {/* Animated dotted connector line behind items (desktop only) */}
      <div className="hidden lg:block absolute top-[50%] left-[12%] right-[12%] h-[2px] border-t-2 border-dotted border-[color:var(--surface-300)] -z-10" />

      {items.map((item, idx) => (
        <Link
          href={item?.link}
          key={item?.link}
          className="relative group block p-2 h-full"
          onMouseEnter={() => setHoveredIndex(idx)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence>
            {hoveredIndex === idx && (
              <motion.span
                className="absolute inset-0 h-full w-full bg-[color:var(--brand-50)] dark:bg-[color:var(--surface-300)] block rounded-[1.75rem]"
                layoutId="hoverBackground"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: 0.15 },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.15, delay: 0.2 },
                }}
              />
            )}
          </AnimatePresence>
          <div className="relative z-10 h-full p-6 flex flex-col items-center text-center bg-[color:var(--surface-glass)] backdrop-blur-xl border border-[color:var(--surface-strong)] rounded-[1.75rem] overflow-hidden group-hover:border-[color:var(--brand-300)] transition-colors duration-300">
            {item.step && (
              <div className="absolute top-[-20px] left-2 font-heading font-bold text-[64px] text-[color:var(--brand-600)] opacity-15 pointer-events-none tracking-tighter">
                {item.step}
              </div>
            )}
            <div className="mb-4 text-[color:var(--brand-600)] group-hover:scale-110 transition-transform duration-300">
              {item.icon}
            </div>
            <h4 className="font-heading font-semibold text-xl text-[color:var(--ink-900)] mt-2 mb-2">
              {item.title}
            </h4>
            <p className="font-sans text-[color:var(--ink-700)] text-sm">
              {item.description}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
};
