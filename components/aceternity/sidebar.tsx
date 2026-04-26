"use client";
import React from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const Sidebar = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "flex flex-col h-full w-64 bg-[color:var(--surface-100)] border-r border-[color:var(--surface-300)] flex-shrink-0 transition-all duration-300",
        className
      )}
    >
      {children}
    </div>
  );
};

export const SidebarHeader = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <div className={cn("p-4 border-b border-[color:var(--surface-300)]", className)}>{children}</div>;
};

export const SidebarContent = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <div className={cn("p-4 flex-1 overflow-y-auto", className)}>{children}</div>;
};

export const SidebarFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <div className={cn("p-4 border-t border-[color:var(--surface-300)]", className)}>{children}</div>;
};

export const SidebarMenu = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  return <ul className={cn("space-y-2", className)}>{children}</ul>;
};

export const SidebarMenuItem = ({
  icon,
  label,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}) => {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-xl transition-colors",
          active
            ? "bg-[color:var(--brand-50)] text-[color:var(--brand-600)] font-semibold border-l-4 border-[color:var(--brand-600)]"
            : "text-[color:var(--ink-700)] hover:bg-[color:var(--surface-200)] hover:text-[color:var(--ink-900)]"
        )}
      >
        {icon}
        <span className="text-sm">{label}</span>
      </Link>
    </li>
  );
};
