// app/dashboard/layout.tsx — SERVER COMPONENT (no 'use client')
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { syncSession } from "@/lib/rust-auth";

type SessionClaims = {
  iat?: number;
  exp?: number;
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionId, sessionClaims } = await auth();

  if (!userId || !sessionId) {
    redirect("/sign-in");
  }

  const claims = (sessionClaims as SessionClaims | null) ?? null;
  const expiresAt = claims?.exp;

  if (expiresAt) {
    void syncSession({
      sessionId,
      userId,
      issuedAt: claims?.iat,
      deviceInfo: undefined,
      expiresAt,
    }).then((result) => {
      if (!result.ok) {
        console.warn("[dashboard/layout] gateway error syncing session:", result.reason);
      }
    });
  }

  return <DashboardShell>{children}</DashboardShell>;
}
