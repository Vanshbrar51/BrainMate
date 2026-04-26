import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  extractTraceContext,
  injectTraceContext,
  withSpan,
  addSpanAttributes,
  addSpanEvent,
} from "@/lib/tracing";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/api/protected(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const parentContext = extractTraceContext(req.headers);

  return withSpan(
    "middleware-auth-processing",
    async () => {
      addSpanAttributes({
        "http.method": req.method,
        "http.url": req.url,
        "http.route": req.nextUrl.pathname,
        "http.target": req.nextUrl.pathname + req.nextUrl.search,
      });

      if (isProtectedRoute(req)) {
        await withSpan(
          "clerk-auth-protect",
          async () => {
            addSpanEvent("clerk.protect.start");
            await auth.protect();
            addSpanEvent("clerk.protect.success");
          },
          parentContext,
        );
      }

      if (isProtectedRoute(req)) {
        const { userId, sessionId, sessionClaims } = await auth();
        if (userId && sessionId) {
          const iat = (sessionClaims as { iat?: number } | null)?.iat ?? 0;

          const isNewSession = Date.now() / 1000 - iat < 30;

          if (isNewSession) {
            const appUrl =
              req.nextUrl.origin ||
              process.env.NEXT_PUBLIC_APP_URL ||
              "http://localhost:3000";

            await withSpan(
              "session-sync-to-gateway",
              async () => {
                addSpanAttributes({
                  "session.user_id": userId,
                  "session.id": sessionId,
                  "session.is_new": true,
                });

                const traceHeaders = injectTraceContext(new Headers());

                const response = await fetch(`${appUrl}/api/auth/sync`, {
                  method: "POST",
                  headers: {
                    Cookie: req.headers.get("cookie") ?? "",
                    ...traceHeaders,
                  },
                  cache: "no-store",
                }).catch(() => null);

                if (!response?.ok) {
                  addSpanEvent("session-sync-failed", {
                    "http.status_code": response?.status ?? 0,
                  });
                  console.warn(
                    `[middleware] Session sync failed (status ${response?.status ?? "network error"}) — reconciliation handled by API or retry required`,
                  );
                }
              },
              parentContext,
            );
          }
        }
      }
    },
    parentContext,
  );
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
