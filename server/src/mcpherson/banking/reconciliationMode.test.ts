import { describe, expect, it } from 'vitest';
import { reconciliationMode, shouldAutoAlignStartingBalance } from './reconciliationMode.js';

describe('controlled reconciliation rollout', () => {
  it('defaults to existing behavior, never silently changes a deployed installation', () => {
    expect(reconciliationMode(undefined)).toBe('legacy');
    expect(reconciliationMode('anything')).toBe('legacy');
  });
  it('can opt into read-only observation for a staging deployment', () => {
    expect(reconciliationMode('observe')).toBe('observe');
    expect(shouldAutoAlignStartingBalance('observe', 1000)).toBe(false);
  });
  it('never aligns against missing bank balances', () => {
    expect(shouldAutoAlignStartingBalance('legacy', null)).toBe(false);
  });
});
