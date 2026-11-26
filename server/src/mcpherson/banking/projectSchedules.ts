import { computeOccurrenceDates, type RecurrenceDefinition, type RecurrenceRule, type RecurrenceType, type WeekendAdjust } from '../../utils/recurrence.js';
import type { CashFlowEvent } from './forecast.js';

export interface ForecastSchedule {
  id: string;
  amount: number;
  amountType: string;
  recurrenceType: string;
  recurrenceRule: string;
  startDate: string;
  endDate: string | null;
  weekendAdjust: string;
  status: string;
  transferAccountId: string | null;
}
export interface ForecastOccurrence {
  id: string;
  scheduleId: string;
  scheduledDate: string;
  expectedDate: string;
  expectedAmount: number;
  status: string;
  matchedTransactionId: string | null;
}

/** Pure preview: project recurrence dates without creating or modifying stored occurrences. */
export function projectScheduleEvents(schedules: ForecastSchedule[], occurrences: ForecastOccurrence[], asOf: string, through: string) {
  const events: CashFlowEvent[] = [];
  const uncertain: string[] = [];
  let projectedCount = 0;
  const existing = new Map(occurrences.map((o) => [`${o.scheduleId}:${o.scheduledDate}`, o]));
  for (const schedule of schedules) {
    if (schedule.status !== 'active' || schedule.transferAccountId !== null) continue;
    let rule: RecurrenceRule;
    try { rule = JSON.parse(schedule.recurrenceRule) as RecurrenceRule; }
    catch { uncertain.push(`Schedule ${schedule.id} has an invalid recurrence rule`); continue; }
    if (rule.type !== schedule.recurrenceType) {
      uncertain.push(`Schedule ${schedule.id} has a mismatched recurrence rule`);
      continue;
    }
    const def: RecurrenceDefinition = {
      startDate: schedule.startDate, endDate: schedule.endDate,
      recurrenceType: schedule.recurrenceType as RecurrenceType,
      recurrenceRule: rule, weekendAdjust: schedule.weekendAdjust as WeekendAdjust,
    };
    // Start before today to capture weekend-adjusted dates that move into the horizon.
    const from = new Date(Date.parse(asOf + 'T00:00:00Z') - 4 * 86_400_000).toISOString().slice(0, 10);
    const until = new Date(Date.parse(through + 'T00:00:00Z') + 4 * 86_400_000).toISOString().slice(0, 10);
    const pairs = computeOccurrenceDates(def, from, until);
    for (const pair of pairs) {
      if (pair.expectedDate <= asOf || pair.expectedDate > through) continue;
      const stored = existing.get(`${schedule.id}:${pair.scheduledDate}`);
      if (stored && (stored.status !== 'pending' || stored.matchedTransactionId !== null)) continue;
      const amount = stored?.expectedAmount ?? schedule.amount;
      events.push({ id: stored?.id ?? `projected:${schedule.id}:${pair.scheduledDate}`, date: stored?.expectedDate ?? pair.expectedDate,
        amount, kind: amount >= 0 ? 'income' : 'bill' });
      if (!stored) projectedCount++;
    }
    if (schedule.amountType !== 'exact') uncertain.push(`Schedule ${schedule.id} uses an estimated or variable amount`);
  }
  return { events, projectedCount, uncertain };
}
