import type { FinancialAlert } from './alerts.js';
export interface AlertPreferences {
  enabled: boolean;
  minimumSeverity: 'info' | 'warning' | 'critical';
  cooldownHours: number;
}
export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  enabled: false, minimumSeverity: 'warning', cooldownHours: 24,
};
const ranks = { info: 0, warning: 1, critical: 2 };
export function validAlertPreferences(value: unknown): value is AlertPreferences {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.enabled === 'boolean' &&
    (v.minimumSeverity === 'info' || v.minimumSeverity === 'warning' || v.minimumSeverity === 'critical') &&
    typeof v.cooldownHours === 'number' && Number.isInteger(v.cooldownHours) && v.cooldownHours >= 1 && v.cooldownHours <= 168;
}
export interface AlertDeliveryRecord { lastShownAt: string; acknowledgedAt: string | null }
/** Pure selection; durable storage and delivery transport are deliberately separate. */
export function eligibleAlertIds(alerts: FinancialAlert[], preferences: AlertPreferences, prior: Map<string, AlertDeliveryRecord>, nowMs: number): string[] {
  if (!preferences.enabled) return [];
  return alerts.filter((alert) => {
    if (ranks[alert.severity] < ranks[preferences.minimumSeverity]) return false;
    const previous = prior.get(alert.id);
    if (!previous) return true;
    if (previous.acknowledgedAt) return false;
    const timestamp = Date.parse(previous.lastShownAt);
    return Number.isFinite(timestamp) && nowMs - timestamp >= preferences.cooldownHours * 3_600_000;
  }).map((alert) => alert.id);
}
