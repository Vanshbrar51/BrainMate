"use client";

import { motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Card = {
  title: string;
  description: string;
  skeleton: React.ReactNode;
  className: string;
  config: {
    y: number;
    x: number;
    rotate: number;
    zIndex: number;
  }
}

const Cards = () => {
  const cards: Card[] = [
    {
      title: "DevHelper",
      description:
        "The Ultimate Developer Copilot. AI Code Debugger, Repository Analyzer, Code Refactor Engine, and more.",
      skeleton: (
        <div className="h-44 w-full rounded-xl overflow-hidden relative flex items-center justify-center bg-transparent mt-2">
          <svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="none">
            <defs>
              <pattern id="bars" width="4" height="150" patternUnits="userSpaceOnUse">
                <rect width="1.5" height="150" fill="white" />
              </pattern>
              <mask id="bar-mask">
                <path d="M0,140 L190,140 L190,20 Q95,40 0,90 Z" fill="white" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="url(#bars)" mask="url(#bar-mask)" />
            <rect x="5" y="5" width="190" height="140" rx="6" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
          </svg>
        </div>
      ),
      className: "bg-[#eb5e28] text-white",
      config: {
        y: -30,
        x: 0,
        rotate: -12,
        zIndex: 2,
      },
    },
    {
      title: "InterviewPro",
      description:
        "AI Technical Interview Simulator. AI Mock Interview, LeetCode Pattern Trainer, Resume Analyzer, and more.",
      skeleton: (
        <div className="h-44 w-full rounded-xl overflow-hidden relative flex items-center justify-center bg-transparent mt-2">
          <svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="none">
            <defs>
              <pattern id="mosaic" width="24" height="24" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="10" height="10" fill="#6d5d52" opacity="0.7" />
                <rect x="12" y="0" width="10" height="10" fill="#a49386" opacity="0.6" />
                <rect x="0" y="12" width="10" height="10" fill="#887869" opacity="0.4" />
                <rect x="12" y="12" width="10" height="10" fill="#4d3f35" opacity="0.85" />
                <rect x="6" y="6" width="10" height="10" fill="#6d5d52" opacity="0.3" />
              </pattern>
            </defs>
            <rect x="10" y="10" width="180" height="130" rx="6" fill="url(#mosaic)" />
            <rect x="10" y="10" width="180" height="130" rx="6" fill="none" stroke="#6d5d52" strokeWidth="1" opacity="0.2" />
          </svg>
        </div>
      ),
      className: "bg-[#f2e6d6] text-[#4d3f35]",
      config: {
        y: 15,
        x: 180,
        rotate: 6,
        zIndex: 3,
      },
    },
    {
      title: "StudyMate",
      description:
        "AI Learning Companion. Advanced Homework Solver, Quiz Generator, AI Tutor Mode, and more.",
      skeleton: (
        <div className="h-44 w-full rounded-xl overflow-hidden relative flex items-center justify-center bg-transparent mt-2">
          <svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="none">
            <rect x="10" y="10" width="180" height="130" rx="6" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
            <g stroke="white" strokeWidth="0.8" fill="none" opacity="0.6">
              <path d="M10,25 Q55,5 100,25 T190,25" />
              <path d="M10,35 Q60,15 110,35 T190,35" />
              <path d="M10,45 Q65,25 120,45 T190,45" />
              <path d="M10,55 Q70,35 130,55 T190,55" />
              <path d="M10,65 Q75,45 140,65 T190,65" />
              <path d="M10,75 Q80,55 150,75 T190,75" />
              <path d="M10,85 Q85,65 160,85 T190,85" />
              <path d="M10,95 Q90,75 170,95 T190,95" />
              <path d="M10,105 Q95,85 180,105 T190,105" />
              <path d="M10,115 Q100,95 185,115 T190,115" />
              <path d="M10,125 Q105,105 190,125 T190,125" />
            </g>
          </svg>
        </div>
      ),
      className: "bg-[#188dd1] text-white",
      config: {
        y: -70,
        x: 360,
        rotate: -4,
        zIndex: 4,
      },
    },
    {
      title: "WriteRight",
      description:
        "AI Writing Engine. AI Essay Writer, Grammar + Style Improver, Tone Transformer, and more.",
      skeleton: (
        <div className="h-44 w-full rounded-xl overflow-hidden relative flex items-center justify-center bg-transparent mt-2">
          <svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="none">
            <defs>
              <pattern id="matrix" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="6" height="3" fill="#005e1f" opacity="0.9" />
                <rect y="4" width="3" height="3" fill="#005e1f" opacity="0.7" />
                <rect x="4" y="4" width="2" height="3" fill="#005e1f" opacity="0.5" />
              </pattern>
            </defs>
            <rect x="10" y="10" width="180" height="130" rx="6" fill="url(#matrix)" />
            <rect x="10" y="10" width="180" height="130" rx="6" fill="none" stroke="#005e1f" strokeWidth="1" opacity="0.4" />
          </svg>
        </div>
      ),
      className: "bg-[#5ce6a1] text-[#004a18]",
      config: {
        y: 25,
        x: 540,
        rotate: 10,
        zIndex: 5,
      },
    },
    {
      title: "ContentFlow",
      description:
        "AI Content Production System. Social Media Generator, YouTube Script Generator, AI Viral Hook Generator, and more.",
      skeleton: (
        <div className="h-44 w-full rounded-xl overflow-hidden relative flex items-center justify-center bg-transparent mt-2">
          <svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="none">
            <defs>
              <pattern id="blueprint" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.2" opacity="0.15" />
              </pattern>
            </defs>
            <rect x="10" y="10" width="180" height="130" rx="6" fill="url(#blueprint)" />
            <g stroke="white" strokeWidth="0.6" fill="none" opacity="0.4">
              <rect x="10" y="10" width="180" height="130" rx="6" />
              <rect x="25" y="25" width="40" height="100" rx="4" />
              <rect x="75" y="25" width="100" height="100" rx="4" />
              <rect x="85" y="35" width="20" height="80" rx="3" />
              <rect x="115" y="35" width="20" height="80" rx="3" />
              <rect x="145" y="35" width="20" height="80" rx="3" />
            </g>
          </svg>
        </div>
      ),
      className: "bg-[#1f1f1f] text-[#f2e6d6]",
      config: {
        y: -40,
        x: 720,
        rotate: -3,
        zIndex: 7,
      },
    }
  ];

  const [active, setActive] = useState<Card | null>(null);

  const ref = useRef<HTMLDivElement>(null);
  const initialScrollY = useRef(0);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setActive(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    initialScrollY.current = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const diff = Math.abs(currentScrollY - initialScrollY.current);
      if (diff > 80) { // Using 80px for a slightly more sensitive feel
        setActive(null);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    }
  }, [active]);

  const isAnyCardActive = () => {
    return active?.title;
  }

  const isCurrentActive = (card: Card) => {
    return active?.title === card.title;
  }

  return <div ref={ref} className="max-w-5xl mx-auto w-full h-[50rem] relative text-white">

    {cards.map((card) =>
      <motion.div key={card.title}>
        <motion.button
          onClick={() => setActive(card)}
          initial={{
            y: 400,
            x: 0,
            scale: 0,
            filter: "blur(10px)",
          }}
          animate={{
            y: isCurrentActive(card) ? 0 : (isAnyCardActive() ? 400 : card.config.y),
            x: isCurrentActive(card) ? 320 : (isAnyCardActive() ? card.config.x * 0.6 + 200 : card.config.x),
            rotate: isCurrentActive(card) ? 0 : (isAnyCardActive() ? card.config.rotate * 0.4 : card.config.rotate),
            scale: isCurrentActive(card) ? 1 : (isAnyCardActive() ? 0.7 : 1),
            width: isCurrentActive(card) ? 400 : 321,
            height: isCurrentActive(card) ? 500 : 400,
            filter: "blur(0px)",
          }}
          whileHover={{
            scale: isCurrentActive(card) ? 1 : (isAnyCardActive() ? 0.7 : 1.05),
          }}
          style={{
            zIndex: isCurrentActive(card) ? 100 : card.config.zIndex
          }}
          transition={{
            type: "spring",
            stiffness: 170,
            damping: 16,
            mass: 0.8,
          }}
          className={cn(
            "w-80 p-9 absolute rounded-[2rem] inset-0 flex flex-col justify-between items-start overflow-hidden transition-colors duration-300 cursor-pointer group hover:border-white/20",
            card.className
          )}
        >
          {card.skeleton}
          <div className="text-left space-y-4 w-full">
            <motion.h2 className="text-4xl font-instrument-serif leading-[1.1] tracking-tight whitespace-pre-line">
              {card.title}
            </motion.h2>
            {isAnyCardActive() && (
              <motion.p
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 0.85, y: 0 }}
                className="text-[0.9375rem] leading-relaxed font-medium max-w-[90%]"
              >
                {card.description}
              </motion.p>
            )}
          </div>
        </motion.button>
      </motion.div>
    )}
  </div>;
};

export default Cards;
