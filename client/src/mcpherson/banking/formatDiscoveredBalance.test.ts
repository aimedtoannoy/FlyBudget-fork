import { describe, expect, it } from 'vitest';
import { formatDiscoveredBalance } from './formatDiscoveredBalance';

describe('formatDiscoveredBalance', () => {
  it('does not interpret yen minor units as USD cents', () => {
    const shown = formatDiscoveredBalance(10000, 'JPY');
    expect(shown).toContain('10,000');
    expect(shown).not.toContain('$100.00');
  });

  it('does not treat an unavailable bank balance as zero', () => {
    expect(formatDiscoveredBalance(null, 'USD')).toBe('Not provided');
  });

  it('preserves a provided zero balance', () => {
    expect(formatDiscoveredBalance(0, 'USD')).not.toBe('Not provided');
  });
});
