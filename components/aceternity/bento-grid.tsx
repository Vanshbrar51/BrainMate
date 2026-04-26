import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "grid md:auto-rows-[18rem] grid-cols-1 md:grid-cols-3 gap-5 max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "row-span-1 rounded-[1.25rem] group/bento hover:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.4)] transition duration-200 shadow-input dark:shadow-none p-4 dark:bg-[color:var(--surface-card)] dark:border-white/[0.2] bg-[color:var(--surface-glass)] border border-[color:var(--surface-strong)] justify-between flex flex-col space-y-4",
        className
      )}
    >
      {header}
      <div className="group-hover/bento:translate-x-2 transition duration-200">
        {icon}
        <div className="font-heading font-semibold text-xl text-[color:var(--ink-900)] mb-2 mt-2">
          {title}
        </div>
        <div className="font-sans font-normal text-sm text-[color:var(--ink-700)]">
          {description}
        </div>
      </div>
    </div>
  );
};
