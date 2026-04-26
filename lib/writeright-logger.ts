// FILE: lib/writeright-logger.ts — Structured JSON logging for API routes

export interface RequestLogContext {
  route: string;
  method: string;
  userId: string | null;
  durationMs: number;
  statusCode: number;
  traceId?: string;
  error?: string;
}

export function logRequest(ctx: RequestLogContext): void {
  if (process.env.NODE_ENV === "production") {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...ctx }));
  } else {
    const isError = ctx.statusCode >= 400;
    const color = isError ? "\x1b[31m" : "\x1b[32m";
    const reset = "\x1b[0m";
    console.log(
      `[WriteRight] ${color}${ctx.method} ${ctx.route}${reset} - ${ctx.statusCode} - ${ctx.durationMs.toFixed(2)}ms${
        ctx.userId ? ` - User: ${ctx.userId}` : ""
      }${ctx.error ? ` - Error: ${ctx.error}` : ""}`
    );
  }
}

// END FILE: lib/writeright-logger.ts
