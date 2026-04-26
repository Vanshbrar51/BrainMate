import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="neutral"
      className={cn(
        "bg-[color:var(--surface-glass)] backdrop-blur-md border-[color:var(--surface-strong)] px-3 py-1 text-[13px] font-medium tracking-[0.08em] uppercase text-[color:var(--ink-600)] rounded-full",
        className
      )}
    >
      {children}
    </Badge>
  );
}
