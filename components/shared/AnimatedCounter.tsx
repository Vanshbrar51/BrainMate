"use client";

import { useEffect, useRef } from "react";
import { useInView } from "framer-motion";

export function AnimatedCounter({
  value,
  duration = 2,
}: {
  value: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!isInView || !ref.current) return;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      const currentVal = Math.floor(progress * value);

      if (ref.current) {
        ref.current.textContent = currentVal.toLocaleString();
      }

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        if (ref.current) ref.current.textContent = value.toLocaleString();
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration, isInView]);

  return <span ref={ref}>{0}</span>;
}
