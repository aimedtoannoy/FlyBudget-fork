import { describe, expect, it } from 'vitest';
import { PlaidEnvironments } from 'plaid';
import {
  mapPlaidAccountType,
  plaidAmountToCents,
  plaidBalanceToCents,
  plaidBalanceSnapshot,
  plaidBasePath,
} from './plaidService.js';

describe('plaidBasePath', () => {
  it('uses Production only when explicitly configured', () => {
    expect(plaidBasePath('production')).toBe(PlaidEnvironments.production);
    expect(plaidBasePath('sandbox')).toBe(PlaidEnvironments.sandbox);
  });

  it('keeps retired "development" configs on Sandbox, where they have always gone', () => {
    expect(plaidBasePath('development')).toBe(PlaidEnvironments.sandbox);
    expect(plaidBasePath('anything-else')).toBe(PlaidEnvironments.sandbox);
  });

  it('only ever talks to Plaid over https', () => {
    for (const env of ['production', 'sandbox', 'development']) {
      expect(plaidBasePath(env)).toMatch(/^https:\/\/[a-z]+\.plaid\.com$/);
    }
  });
});

describe('mapPlaidAccountType', () => {
  // Plaid Sandbox's First Platypus Bank returns all of these
  it.each([
    ['depository', 'checking', 'checking'],
    ['depository', 'savings', 'savings'],
    ['depository', 'cd', 'savings'],
    ['depository', 'money market', 'savings'],
    ['depository', 'hsa', 'savings'],
    ['depository', 'cash management', 'checking'],
    ['credit', 'credit card', 'credit'],
    ['investment', 'ira', 'retirement'],
    ['investment', '401k', 'retirement'],
    ['investment', 'brokerage', 'investment'],
    ['investment', 'crypto exchange', 'crypto'],
    ['investment', null, 'investment'],
    ['loan', 'student', 'student_loan'],
    ['loan', 'mortgage', 'mortgage'],
    ['loan', 'auto', 'auto_loan'],
    ['loan', 'home equity', 'line_of_credit'],
    ['loan', 'consumer', 'loan'],
  ])('%s/%s -> %s', (type, subtype, expected) => {
    expect(mapPlaidAccountType(type, subtype)).toBe(expected);
  });

  it('stores debt balances as negative', () => {
    expect(plaidBalanceToCents(65262, 'loan')).toBe(-6526200);
    expect(plaidBalanceToCents(410, 'credit')).toBe(-41000);
    expect(plaidBalanceToCents(110, 'depository')).toBe(11000);
  });
});

describe('plaidAmountToCents', () => {
  it('flips Plaid sign (positive = money out) to app sign (negative = outflow)', () => {
    expect(plaidAmountToCents(12.34)).toBe(-1234);
    expect(plaidAmountToCents(-50)).toBe(5000);
  });
});

describe('plaidBalanceSnapshot', () => {
  const fetchedAt = '2026-11-21T22:00:00.000Z';

  it('preserves current and available separately even if available is higher', () => {
    expect(
      plaidBalanceSnapshot({ current: 195.41, available: 108.83 }, 'depository', 2, fetchedAt),
    ).toMatchObject({ bankCurrentBalance: 19541, bankAvailableBalance: 10883 });
    expect(
      plaidBalanceSnapshot({ current: 64.96, available: 71.25 }, 'depository', 2, fetchedAt),
    ).toEqual({
      bankCurrentBalance: 6496,
      bankAvailableBalance: 7125,
      bankBalanceFetchedAt: fetchedAt,
    });
  });

  it('distinguishes missing fields from zero', () => {
    expect(
      plaidBalanceSnapshot({ current: 0, available: null }, 'depository', 2, fetchedAt),
    ).toMatchObject({ bankCurrentBalance: 0, bankAvailableBalance: null });
    expect(
      plaidBalanceSnapshot({ current: null, available: 20 }, 'depository', 2, fetchedAt),
    ).toMatchObject({ bankCurrentBalance: null, bankAvailableBalance: 2000 });
  });

  it('does not turn available credit into debt', () => {
    expect(
      plaidBalanceSnapshot({ current: 100, available: 900 }, 'credit', 2, fetchedAt),
    ).toMatchObject({ bankCurrentBalance: -10000, bankAvailableBalance: 90000 });
  });
});
