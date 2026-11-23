import { describe, expect, it, vi } from 'vitest';
import { isRetryablePlaidError, withPlaidRetry } from './retry.js';

describe('bounded Plaid retry', () => {
  it('retries transient provider errors and then returns the result', async () => {
    const op = vi.fn().mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValue('ok');
    const wait = vi.fn(async () => {});
    await expect(withPlaidRetry(op, { wait })).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
  });
  it('never retries login-required errors', async () => {
    const error = { response: { status: 400, data: { error_code: 'ITEM_LOGIN_REQUIRED' } } };
    const op = vi.fn().mockRejectedValue(error);
    await expect(withPlaidRetry(op, { wait: async () => {} })).rejects.toBe(error);
    expect(op).toHaveBeenCalledTimes(1);
    expect(isRetryablePlaidError(error)).toBe(false);
  });
  it('stops after three attempts', async () => {
    const op = vi.fn().mockRejectedValue({ code: 'ETIMEDOUT' });
    await expect(withPlaidRetry(op, { wait: async () => {} })).rejects.toBeDefined();
    expect(op).toHaveBeenCalledTimes(3);
  });
  it('does not retry arbitrary exceptions', () => {
    expect(isRetryablePlaidError(new Error('programmer error'))).toBe(false);
  });
});
