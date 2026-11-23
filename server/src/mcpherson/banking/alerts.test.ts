import { describe, expect, it } from 'vitest';
import { bankingAlertCandidates } from './alerts.js';

describe('bank alert candidates', () => {
  it('reports login repair and stale balance without sending anything', () => {
    const alerts = bankingAlertCandidates([{ itemId: 'one', institutionName: 'Example', status: 'login_required', transactionFreshness: 'fresh', accountName: 'Checking', balanceFreshness: 'stale' }]);
    expect(alerts.map((a) => a.code)).toEqual(['RECONNECT', 'STALE_BALANCE']);
  });
  it('does not flag a healthy institution', () => {
    expect(bankingAlertCandidates([{ itemId: 'one', institutionName: 'Example', status: 'good', transactionFreshness: 'fresh', accountName: 'Checking', balanceFreshness: 'fresh' }])).toEqual([]);
  });
});
