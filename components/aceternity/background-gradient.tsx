"use client";
import React from "react";
import { motion } from "framer-motion";

export const BackgroundGradient = ({
  children,
  className,
  containerClassName,
  animate = true,
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
  animate?: boolean;
}) => {
  return (
    <div className={`relative p-[4px] group ${containerClassName}`}>
      <motion.div
        animate={
          animate
            ? {
                backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
              }
            : {}
        }
        transition={
          animate
            ? {
                duration: 5,
                repeat: Infinity,
                repeatType: "reverse",
              }
            : {}
        }
        style={{
          backgroundSize: "400% 400%",
        }}
        className={`absolute inset-0 rounded-[1.75rem] z-[1] bg-[linear-gradient(90deg,var(--brand-300),var(--accent-300),var(--brand-500))] blur-xl opacity-60 group-hover:opacity-100 transition duration-500 will-change-transform`}
      />
      <div className={`relative z-10 ${className}`}>{children}</div>
    </div>
  );
};
