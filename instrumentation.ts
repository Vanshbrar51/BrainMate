// instrumentation.ts — Next.js 16 instrumentation hook
//
// This file is automatically loaded by Next.js before any server-side code.
// It initializes OpenTelemetry, the Redis connection pool, and the
// reconciliation worker on the Node.js runtime only (not Edge).
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize OpenTelemetry first so all subsequent spans are captured.
    await import('./lib/opentelemetry');

    // Rotate cloud secrets on a schedule.
    const { startRotationChecker } = await import('./lib/secrets');
    startRotationChecker();

    // Eagerly initialize the Redis connection pool so it is ready before the
    // first request arrives, rather than lazily on first use.
    const { initRedisPool, shutdownRedisPool } = await import('./lib/redis');
    await initRedisPool(); // Await full connection establishment before continuing.

    // Register graceful shutdown handlers so in-flight Redis commands finish
    // before the process exits during rolling deploys or SIGTERM from the OS.
    const shutdown = async (signal: string) => {
      console.log(`[instrumentation] ${signal} received — shutting down Redis pool`);
      await shutdownRedisPool();
      process.exit(0);
    };
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('SIGINT',  () => void shutdown('SIGINT'));

    if (process.env.ENABLE_RECONCILIATION_WORKER === 'true') {
      const { startWorker } = await import('./lib/reconciliation-worker');
      void startWorker();
    }

    // WriteRight: The primary job consumer is the Python FastAPI worker.
    // This Node.js poller is an optional fallback for environments where
    // the Python worker is not deployed separately.
    if (process.env.ENABLE_WRITERIGHT_WORKER === 'true') {
      console.log('[instrumentation] WriteRight Node.js fallback worker enabled');
      // Future: import and start a Node.js-based queue poller here
      // const { startWriteRightPoller } = await import('./lib/writeright-poller');
      // void startWriteRightPoller();
    }

    console.log('[instrumentation] OpenTelemetry + Redis pool registered for Node.js runtime');
  }
}

export async function onRequestError(
  error: Error,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  // Log unhandled request errors with trace context for correlation
  console.error('[instrumentation] Unhandled request error:', {
    error: error.message,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
}
