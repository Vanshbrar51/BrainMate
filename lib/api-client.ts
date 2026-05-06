/**
 * lib/api-client.ts — Standardized client-side API fetchers
 */

export async function apiPost<T>(
  url: string,
  body: unknown,
  options?: { headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(body),
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
      error?: string
      code?: string
    }
    const apiError = new Error(err.error ?? `Request failed: ${res.status}`) as Error & { code?: string }
    apiError.code = err.code
    throw apiError
  }
  return res.json()
}

export async function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
      error?: string
      code?: string
    }
    const apiError = new Error(err.error ?? `Request failed: ${res.status}`) as Error & { code?: string }
    apiError.code = err.code
    throw apiError
  }
  return res.json()
}
