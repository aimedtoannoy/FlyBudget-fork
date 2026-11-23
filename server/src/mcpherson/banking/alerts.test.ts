import { describe, expect, it } from 'vitest';
import { bankingAlertCandidates, forecastAlertCandidates, prioritizeAlerts, reconciliationAlertCandidates } from './alerts.js';

describe('bank alert candidates', () => {
  it('reports reconnection and stale balance without notifications', () => {
    const alerts = bankingAlertCandidates([{ itemId: 'one', institutionName: 'Example', status: 'login_required', transactionFreshness: 'fresh', accountName: 'Checking', balanceFreshness: 'stale' }]);
    expect(alerts.map((a) => a.code)).toEqual(['RECONNECT', 'STALE_BALANCE']);
  });
  it('does not flag healthy institutions', () => {
    expect(bankingAlertCandidates([{ itemId: 'one', institutionName: 'Example', status: 'good', transactionFreshness: 'fresh', accountName: 'Checking', balanceFreshness: 'fresh' }])).toEqual([]);
  });
  it('suppresses redundant stale transaction warning during reconnect', () => {
    const alerts = bankingAlertCandidates([{ itemId: 'one', institutionName: 'Example', status: 'login_required', transactionFreshness: 'stale', accountName: null, balanceFreshness: null }]);
    expect(alerts.map((a) => a.code)).toEqual(['RECONNECT']);
  });
});
const forecast = { accountId: 'checking', accountName: 'Checking', available: 2000, safeToSpendNow: 0, reserve: 500, through: '2026-12-07', uncertainSchedules: [], timeline: [{ id: 'bill', date: '2026-11-28', amount: -3000, kind: 'bill', projectedBalance: -1000 }] };
describe('financial alert candidates', () => {
  it('flags estimated overdraft, no safe spending and upcoming bills', () => {
    expect(forecastAlertCandidates(forecast).map((a) => a.code)).toEqual(['LOW_SAFE_TO_SPEND', 'PROJECTED_OVERDRAFT', 'UPCOMING_BILLS']);
  });
  it('does not flag an overdraft for a nonnegative forecast', () => {
    expect(forecastAlertCandidates({ ...forecast, safeToSpendNow: 1000, timeline: [{ ...forecast.timeline[0], amount: -500, projectedBalance: 1500 }] }).map((a) => a.code)).toEqual(['UPCOMING_BILLS']);
  });
  it('flags uncertain schedules without inventing amounts', () => {
    expect(forecastAlertCandidates({ ...forecast, timeline: [], uncertainSchedules: ['Variable rent'] }).map((a) => a.code)).toEqual(['UNCERTAIN_SCHEDULES']);
  });
  it('only flags known reconciliation discrepancies', () => {
    expect(reconciliationAlertCandidates([{ accountId: 'a', state: 'matched', currentDifference: 0 }, { accountId: 'b', state: 'difference', currentDifference: 50 }, { accountId: 'c', state: 'unavailable', currentDifference: null }]).map((a) => a.accountId)).toEqual(['b']);
  });
  it('deduplicates stable IDs and sorts urgent alerts first', () => {
    const list = forecastAlertCandidates(forecast);
    expect(prioritizeAlerts([...list, ...list]).map((a) => a.severity)).toEqual(['critical', 'warning', 'info']);
  });
});
