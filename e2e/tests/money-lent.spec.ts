import { test, expect, isoDay, open } from './fixtures';

test('Money Lent opens a separate person page and keeps credits distinct from payments', async ({
  page, api,
}) => {
  await api.createAccount('Checking');
  const profile = await api.call<{ id: string }>('POST', '/personal-loans/profiles', {
    name: 'Test Borrower Profile',
    notes: null,
  });
  const loan = await api.call<{ id: string }>('POST', '/personal-loans', {
    borrower: 'Test Borrower Profile',
    profileId: profile.id,
    title: 'October assistance',
    principal: 20000,
    lentOn: isoDay(-3),
    repaymentMode: 'open',
    firstDueOn: null,
    cadence: null,
    installmentAmount: null,
    remindersEnabled: 0,
    notes: 'Keep an existing loan record intact',
  });

  await open(page, '/money-lent');
  await expect(page.getByRole('heading', { level: 1, name: 'Money Lent' })).toBeVisible();
  await expect(page.getByText('October assistance')).toHaveCount(0);
  await page.getByRole('button', { name: /Test Borrower Profile/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/money-lent/people/${profile.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Test Borrower Profile' }))
    .toBeVisible();
  await expect(page.getByText('October assistance')).toBeVisible();

  await page.getByRole('button', { name: 'Apply credit', exact: true }).click();
  await page.getByLabel('Credit amount').fill('50.00');
  await page.getByRole('button', { name: 'Apply credit', exact: true }).last().click();
  await expect(page.getByText(/Credit applied:.*\$50/)).toBeVisible();
  const updated = await api.call<{
    id: string; credited: number; repaid: number; outstanding: number;
  }[]>('GET', '/personal-loans');
  expect(updated.find((l) => l.id === loan.id)).toMatchObject({
    credited: 5000,
    repaid: 0,
    outstanding: 15000,
  });

  await page.getByRole('button', { name: 'Back to Money Lent' }).click();
  await expect(page).toHaveURL(/#\/money-lent$/);
  await expect(page.getByText('October assistance')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Money Lent' }))
    .toBeVisible();
});
