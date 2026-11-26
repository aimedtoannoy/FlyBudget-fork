/** Retry only transport/transient Plaid failures, never invalid credentials or consent errors. */
export function isRetryablePlaidError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; response?: { status?: number; data?: { error_code?: string } } };
  const providerCode = err.response?.data?.error_code;
  if (providerCode === 'ITEM_LOGIN_REQUIRED' || providerCode === 'INVALID_ACCESS_TOKEN' || providerCode === 'INVALID_CREDENTIALS') return false;
  const status = err.response?.status;
  if (status === 429 || (typeof status === 'number' && status >= 500 && status <= 599)) return true;
  // No HTTP response means a transport error; do not retry arbitrary programming failures.
  return !err.response && ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND'].includes(err.code ?? '');
}

export async function withPlaidRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(4, Math.floor(options.maxAttempts ?? 3)));
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (attempt >= maxAttempts || !isRetryablePlaidError(error)) throw error;
      await wait(250 * 2 ** (attempt - 1));
    }
  }
}
