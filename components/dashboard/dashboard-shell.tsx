"use client";

import { usePathname } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTopbar } from "@/components/dashboard/dashboard-topbar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-[var(--bg)] transition-colors duration-300">
      <DashboardSidebar />
      <div className="flex h-screen flex-1 flex-col overflow-hidden">
        <DashboardTopbar pathname={pathname} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
