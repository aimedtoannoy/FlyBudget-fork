import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BankBalances } from './BankBalances';

const account = {
  type: 'checking' as const,
  currency: 'USD',
  bankSource: 'plaid' as const,
  bankCurrentBalance: 19541,
  bankAvailableBalance: 10883,
  bankBalanceFetchedAt: '2026-11-21T22:00:00.000Z',
};

describe('BankBalances', () => {
  it('renders both bank fields without replacing the ledger balance', () => {
    const html = renderToStaticMarkup(<BankBalances account={account} />);
    expect(html).toContain('Bank balance:');
    expect(html).toContain('195.41');
    expect(html).toContain('Available:');
    expect(html).toContain('108.83');
    expect(html).toContain('Fetched from Plaid:');
  });

  it('distinguishes null from a real zero', () => {
    const missing = renderToStaticMarkup(
      <BankBalances account={{ ...account, bankAvailableBalance: null }} />,
    );
    expect(missing).toContain('Not provided');
    const zero = renderToStaticMarkup(
      <BankBalances account={{ ...account, bankAvailableBalance: 0 }} />,
    );
    expect(zero).toContain('0.00');
    expect(zero).not.toContain('Not provided');
  });

  it('does not render bank data for an unlinked account', () => {
    expect(renderToStaticMarkup(<BankBalances account={{ ...account, bankSource: null }} />)).toBe('');
  });
});
