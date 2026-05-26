// app/dashboard/layout.tsx — top-level passthrough
// Auth is handled per-subtree:
//   - (shell)/layout.tsx handles all shell routes (sidebar + topbar)
//   - writing/layout.tsx handles the standalone WriteRight route
// This file intentionally passes children through without wrapping.
export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
