import { cn } from "@/lib/utils";
import React from "react";

export function GradientText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-clip-text text-transparent bg-[linear-gradient(120deg,var(--brand-600),var(--accent-500)_48%,var(--brand-500))]",
        className
      )}
    >
      {children}
    </span>
  );
}
