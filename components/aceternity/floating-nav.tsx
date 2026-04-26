"use client";
import React, { useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "framer-motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const FloatingNav = ({
  navItems,
  className,
  rightActions,
}: {
  navItems: {
    name: string;
    link: string;
    icon?: React.ReactNode;
  }[];
  className?: string;
  rightActions?: React.ReactNode;
}) => {
  const { scrollYProgress } = useScroll();
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useMotionValueEvent(scrollYProgress, "change", (current) => {
    if (typeof current === "number") {
      const direction = current - scrollYProgress.getPrevious()!;

      if (scrollYProgress.get() < 0.05) {
        setVisible(false);
      } else {
        if (direction < 0) {
          setVisible(true);
        } else {
          setVisible(false);
        }
      }
    }
  });

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{
          opacity: 1,
          y: -100,
        }}
        animate={{
          y: visible || scrollYProgress.get() < 0.05 ? 0 : -100,
          opacity: visible || scrollYProgress.get() < 0.05 ? 1 : 0,
        }}
        transition={{
          duration: 0.2,
        }}
        className={cn(
          "flex max-w-fit fixed top-6 inset-x-0 mx-auto border border-[color:var(--surface-strong)] bg-[color:var(--surface-glass)] backdrop-blur-xl rounded-full z-[5000] px-4 py-2 items-center space-x-4",
          className
        )}
      >
        <Link href="/" className="font-heading font-bold text-lg mr-4 flex items-center gap-2">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--brand-600)]">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
           </svg>
           <span className="hidden sm:inline-block">BrainMate AI</span>
        </Link>
        {navItems.map((navItem, idx: number) => (
          <Link
            key={`link-${idx}`}
            href={navItem.link}
            className={cn(
              "relative items-center flex space-x-1 text-sm font-medium hover:text-[color:var(--brand-600)] transition-colors",
              pathname === navItem.link ? "text-[color:var(--brand-600)]" : "text-[color:var(--ink-700)]"
            )}
          >
            <span className="block sm:hidden">{navItem.icon}</span>
            <span className="hidden sm:block text-sm">{navItem.name}</span>
            {pathname === navItem.link && (
               <motion.span
                 layoutId="nav-underline"
                 className="absolute left-0 right-0 -bottom-[10px] h-0.5 bg-[color:var(--brand-600)] rounded-full"
               />
            )}
          </Link>
        ))}
        {rightActions && <div className="ml-4 pl-4 border-l border-[color:var(--surface-200)] flex items-center gap-2">{rightActions}</div>}
      </motion.div>
    </AnimatePresence>
  );
};
