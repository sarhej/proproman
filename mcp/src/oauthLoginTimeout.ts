/**
 * Optional cap on how long `tymio-mcp login` waits for the browser OAuth redirect.
 * Unset or invalid = wait indefinitely (legacy behavior).
 */
export function readOAuthLoginTimeoutMs(): number | undefined {
  const raw = process.env.TYMIO_OAUTH_LOGIN_TIMEOUT_MS?.trim();
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/** Race `promise` against a timeout; clears the timer when `promise` wins. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
