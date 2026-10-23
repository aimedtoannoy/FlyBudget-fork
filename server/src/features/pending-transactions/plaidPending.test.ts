import { describe, expect, it } from 'vitest';
import { priorPendingImportId } from './plaidPending.js';

describe('Plaid pending-to-posted matching', () => {
  it('uses the explicit ID Plaid provides for the prior pending authorization', () => {
    expect(priorPendingImportId(false, 'pending-123')).toBe('plaid:pending-123');
  });

  it('does not guess a match based on amount or merchant', () => {
    expect(priorPendingImportId(false, null)).toBeNull();
  });

  it('never attempts to promote another pending authorization', () => {
    expect(priorPendingImportId(true, 'pending-123')).toBeNull();
  });
});
