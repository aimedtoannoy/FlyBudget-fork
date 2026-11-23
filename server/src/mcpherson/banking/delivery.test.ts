import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_PREFERENCES, eligibleAlertIds, validAlertPreferences } from './delivery.js';
import type { FinancialAlert } from './alerts.js';
const alert: FinancialAlert = { id: 'checking:LOW', itemId: '', accountId: 'checking', severity: 'warning', code: 'LOW', message: 'Low cash', action: 'review_forecast' };
const enabled = { ...DEFAULT_ALERT_PREFERENCES, enabled: true };
describe('alert delivery policy', () => {
  it('defaults to opt-out', () => expect(eligibleAlertIds([alert], DEFAULT_ALERT_PREFERENCES, new Map(), Date.now())).toEqual([]));
  it('validates controls', () => {
    expect(validAlertPreferences(enabled)).toBe(true);
    expect(validAlertPreferences({ ...enabled, cooldownHours: 0 })).toBe(false);
    expect(validAlertPreferences({ ...enabled, minimumSeverity: 'all' })).toBe(false);
  });
  it('enforces severity and cooldown', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    expect(eligibleAlertIds([alert], { ...enabled, minimumSeverity: 'critical' }, new Map(), now)).toEqual([]);
    const recent = new Map([[alert.id, { lastShownAt: new Date(now - 3600000).toISOString(), acknowledgedAt: null }]]);
    expect(eligibleAlertIds([alert], enabled, recent, now)).toEqual([]);
    expect(eligibleAlertIds([alert], enabled, recent, now + 86400000)).toEqual([alert.id]);
    recent.set(alert.id, { lastShownAt: new Date(now - 86400000).toISOString(), acknowledgedAt: new Date(now).toISOString() });
    expect(eligibleAlertIds([alert], enabled, recent, now + 86400000)).toEqual([]);
  });
});
