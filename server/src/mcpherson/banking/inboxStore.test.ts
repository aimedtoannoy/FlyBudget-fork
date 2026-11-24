import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { refreshAlertInbox } from './inboxStore.js';
import type { FinancialAlert } from './alerts.js';
const warning: FinancialAlert = { id: 'account:warning', itemId: '', severity: 'warning', code: 'LOW', message: 'Test warning', action: 'review_forecast' };
const now = Date.parse('2026-11-24T00:00:00Z');
describe('migrated SQLite alert lifecycle', () => {
  it('persists delivery, suppresses repeats, filters severity, acknowledges and reopens resolved conditions', () => {
    const sqlite = new Database(':memory:');
    try {
      const database = drizzle(sqlite, { schema });
      migrate(database, { migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)) });
      expect(refreshAlertInbox(database, [warning], now)).toMatchObject({ enabled: false, newlyDelivered: 0 });
      database.insert(schema.mcAlertPreferences).values({ id: 'default', enabled: 1 }).run();
      expect(refreshAlertInbox(database, [warning], now)).toMatchObject({ newlyDelivered: 1, alerts: [warning] });
      expect(refreshAlertInbox(database, [warning], now + 1000)).toMatchObject({ newlyDelivered: 0, alerts: [warning] });
      expect(refreshAlertInbox(database, [warning], now + 86400000)).toMatchObject({ newlyDelivered: 1 });
      database.update(schema.mcAlertPreferences).set({ minimumSeverity: 'critical' }).run();
      expect(refreshAlertInbox(database, [warning], now + 86401000).alerts).toEqual([]);
      database.update(schema.mcAlertPreferences).set({ minimumSeverity: 'warning' }).run();
      database.update(schema.mcAlertDeliveryState).set({ acknowledgedAt: new Date(now + 86402000).toISOString() }).where(eq(schema.mcAlertDeliveryState.alertId, warning.id)).run();
      expect(refreshAlertInbox(database, [warning], now + 172800000)).toMatchObject({ newlyDelivered: 0, alerts: [] });
      expect(refreshAlertInbox(database, [], now + 172801000).alerts).toEqual([]);
      expect(database.select().from(schema.mcAlertDeliveryState).all()).toEqual([]);
      expect(refreshAlertInbox(database, [warning], now + 172802000)).toMatchObject({ newlyDelivered: 1, alerts: [warning] });
      expect(database.select().from(schema.accounts).all()).toEqual([]);
    } finally { sqlite.close(); }
  });
});
