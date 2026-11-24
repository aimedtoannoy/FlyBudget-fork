import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../../db/schema.js';

const migrations = fileURLToPath(new URL('../../db/migrations', import.meta.url));
describe('Phase 7 upgrade and rollback rehearsal', () => {
  it('preserves populated pre-extension tables through upgrade and restores a consistent backup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'flybudget-upgrade-'));
    const old = join(root, 'old-migrations');
    mkdirSync(join(old, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 30);
    writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) writeFileSync(join(old, entry.tag + '.sql'), readFileSync(join(migrations, entry.tag + '.sql')));
    const sqlite = new Database(join(root, 'working.db'));
    try {
      sqlite.pragma('foreign_keys = ON');
      sqlite.pragma('journal_mode = WAL');
      const database = drizzle(sqlite, { schema });
      migrate(database, { migrationsFolder: old });
      // Synthetic fixtures only; no production credentials or records.
      database.insert(schema.accounts).values({ id: 'checking', name: 'Fixture checking', type: 'checking', startingBalance: 100000, currency: 'USD' }).run();
      database.insert(schema.transactions).values([
        { id: 'posted', accountId: 'checking', date: '2026-11-01', amount: -12000, notes: 'Preserve edited note' },
        { id: 'pending', accountId: 'checking', date: '2026-11-23', amount: -3000, pending: 1 },
      ]).run();
      database.insert(schema.schedules).values({ id: 'bill', name: 'Fixture bill', accountId: 'checking', amount: -20000, recurrenceType: 'monthly', startDate: '2026-11-28' }).run();
      database.insert(schema.personalLoans).values({ id: 'loan', borrower: 'Fixture borrower', principal: 50000, lentOn: '2026-11-01' }).run();
      database.insert(schema.personalLoanRepayments).values({ id: 'repayment', loanId: 'loan', amount: 5000, paidOn: '2026-11-02' }).run();
      database.insert(schema.personalLoanAdvances).values({ id: 'advance', loanId: 'loan', amount: 1000, advancedOn: '2026-11-03' }).run();
      const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name").all() as { name: string }[]).map(row => row.name);
      const snapshot = (connection: Database.Database) => tables.map(name => ({ name, rows: connection.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all() }));
      const before = snapshot(sqlite);
      await sqlite.backup(join(root, 'backup.db'));
      migrate(database, { migrationsFolder: migrations });
      expect(snapshot(sqlite)).toEqual(before);
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      migrate(database, { migrationsFolder: migrations });
      expect(snapshot(sqlite)).toEqual(before);
      const restored = new Database(join(root, 'backup.db'), { readonly: true });
      try {
        expect(snapshot(restored)).toEqual(before);
        expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(restored.prepare("SELECT name FROM sqlite_master WHERE name='mc_alert_delivery_state'").get()).toBeUndefined();
      } finally { restored.close(); }
    } finally { sqlite.close(); rmSync(root, { recursive: true, force: true }); }
  });
});
