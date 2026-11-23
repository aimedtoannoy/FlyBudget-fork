import { describe, expect, it } from 'vitest';
import { projectScheduleEvents, type ForecastSchedule } from './projectSchedules.js';

const schedule: ForecastSchedule = {
  id: 'pay', amount: 150000, amountType: 'exact', recurrenceType: 'biweekly',
  recurrenceRule: JSON.stringify({ type: 'biweekly', anchorDay: 5 }),
  startDate: '2026-11-06', endDate: null, weekendAdjust: 'none', status: 'active', transferAccountId: null,
};

describe('read-only recurring forecast projection', () => {
  it('generates biweekly paychecks without stored occurrences', () => {
    const result = projectScheduleEvents([schedule], [], '2026-11-10', '2026-12-10');
    expect(result.events.map((e) => e.date)).toEqual(['2026-11-20', '2026-12-04']);
    expect(result.projectedCount).toBe(2);
  });
  it('never double-counts paid or skipped occurrences', () => {
    const existing = { id: 'paid', scheduleId: 'pay', scheduledDate: '2026-11-20', expectedDate: '2026-11-20', expectedAmount: 150000, status: 'paid', matchedTransactionId: 'tx1' };
    const result = projectScheduleEvents([schedule], [existing], '2026-11-10', '2026-12-10');
    expect(result.events.map((e) => e.date)).toEqual(['2026-12-04']);
  });
  it('respects stored expected amount and never duplicates the same occurrence', () => {
    const existing = { id: 'pending', scheduleId: 'pay', scheduledDate: '2026-11-20', expectedDate: '2026-11-20', expectedAmount: 175000, status: 'pending', matchedTransactionId: null };
    const result = projectScheduleEvents([schedule], [existing], '2026-11-10', '2026-12-10');
    expect(result.events[0].amount).toBe(175000);
    expect(result.events.filter((e) => e.date === '2026-11-20')).toHaveLength(1);
  });
  it('handles month end and excludes inactive or transfer schedules', () => {
    const monthly = { ...schedule, id: 'rent', amount: -100000, recurrenceType: 'monthly', recurrenceRule: JSON.stringify({ type: 'monthly', interval: 1, anchorDay: 31 }), startDate: '2026-01-31' };
    const result = projectScheduleEvents([monthly, { ...monthly, id: 'paused', status: 'paused' }, { ...monthly, id: 'transfer', transferAccountId: 'other' }], [], '2026-02-01', '2026-03-31');
    expect(result.events.map((e) => e.date)).toEqual(['2026-02-28', '2026-03-31']);
  });
  it('flags variable amounts and ignores invalid recurrence JSON', () => {
    const result = projectScheduleEvents([{ ...schedule, amountType: 'variable' }, { ...schedule, id: 'bad', recurrenceRule: 'broken' }], [], '2026-11-10', '2026-12-10');
    expect(result.uncertain).toHaveLength(2);
  });
});
