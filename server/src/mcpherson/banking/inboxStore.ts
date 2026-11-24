import type { db } from '../../db/index.js';
import { mcAlertPreferences, mcAlertDeliveryState } from '../../db/schema.js';
import { eq, notInArray } from 'drizzle-orm';
import { DEFAULT_ALERT_PREFERENCES, eligibleAlertIds } from './delivery.js';
import type { FinancialAlert } from './alerts.js';

/** Shared production/test implementation; only notification tables are written. */
export function refreshAlertInbox(database: typeof db, alerts: FinancialAlert[], now: number) {
  return database.transaction(() => {
    const row = database.select().from(mcAlertPreferences).where(eq(mcAlertPreferences.id, 'default')).get();
    const preferences = row ? { enabled: row.enabled === 1, minimumSeverity: row.minimumSeverity as 'info' | 'warning' | 'critical', cooldownHours: row.cooldownHours } : DEFAULT_ALERT_PREFERENCES;
    // Resolution clears old suppression; a later recurrence can alert again.
    const activeIds = alerts.map((alert) => alert.id);
    if (activeIds.length) database.delete(mcAlertDeliveryState).where(notInArray(mcAlertDeliveryState.alertId, activeIds)).run();
    else database.delete(mcAlertDeliveryState).run();
    if (!preferences.enabled) return { enabled: false, alerts: [], newlyDelivered: 0 };
    const existing = new Map(database.select().from(mcAlertDeliveryState).all().map((entry) => [entry.alertId, entry]));
    const eligible = new Set(eligibleAlertIds(alerts, preferences, existing, now));
    for (const alert of alerts) {
      if (!eligible.has(alert.id)) continue;
      database.insert(mcAlertDeliveryState).values({ alertId: alert.id, lastShownAt: new Date(now).toISOString(), acknowledgedAt: null })
        .onConflictDoUpdate({ target: mcAlertDeliveryState.alertId, set: { lastShownAt: new Date(now).toISOString(), acknowledgedAt: null } }).run();
    }
    const current = database.select().from(mcAlertDeliveryState).all();
    const visible = new Set(current.filter((entry) => !entry.acknowledgedAt).map((entry) => entry.alertId));
    const allowed = new Set(eligibleAlertIds(alerts, preferences, new Map(), now));
    return { enabled: true, newlyDelivered: eligible.size, alerts: alerts.filter((alert) => visible.has(alert.id) && allowed.has(alert.id)) };
  });
}
