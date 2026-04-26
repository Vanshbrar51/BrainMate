"use client";
import React, { useEffect, useRef } from "react";
import { useMousePosition } from "@/lib/use-mouse-position";

export const BackgroundBeams = ({ className }: { className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const position = useMousePosition();

  useEffect(() => {
    if (ref.current) {
      ref.current.style.setProperty("--mouse-x", `${position.x}px`);
      ref.current.style.setProperty("--mouse-y", `${position.y}px`);
    }
  }, [position]);

  return (
    <div
      ref={ref}
      className={`absolute inset-0 z-[-1] overflow-hidden ${className || ""}`}
      style={{
        background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--spotlight-color), transparent 40%)`,
      }}
    >
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.04] pointer-events-none" />
    </div>
  );
};
