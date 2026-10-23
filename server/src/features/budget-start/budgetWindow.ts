/**
 * Older bank history is useful for reports and recurring-payment detection, but
 * must not create an imaginary unallocated budget balance.
 *
 * Months before the configured baseline remain browsable as history. The first
 * budget month starts with the user's manually verified unassigned funds; later
 * months carry allocations and income only from that month forward.
 */
export function effectiveStartMonth(
  viewedMonth: string,
  configuredStartMonth: string | null,
): string | null {
  return configuredStartMonth && viewedMonth >= configuredStartMonth
    ? configuredStartMonth
    : null;
}
