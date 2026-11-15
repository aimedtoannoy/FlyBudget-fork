# Money Lent / person financial profiles

Money Lent is a tracking ledger for money you lend other people. **It never
creates, edits or deletes a real bank transaction** and does not double-count
cash available to budget. It remains distinct from FlyBudget's net-worth accounts.

## Layout and navigation

- **Money Lent** (sidebar → `/money-lent`) is an overview containing totals
  and a list of people. Individual loans are **not** expanded here.
- Select a person to open their **separate financial profile page**
  (`/money-lent/people/:profileId`), with their name, notes, summary,
  separate loans and histories. Use **Back to Money Lent** to return.
- Choose **Add person** on the overview, and **New loan** on that person's page.
- Each loan has an independent title, original amount, due arrangement,
  notes, additional money lent, non-cash credits and real repayments.
- Change an existing loan's owner with **Edit / move loan → Person**.
  Existing IDs, bank links, payment history, notes and schedules are preserved.

## The three distinct operations

| Button | What happens | Counts as cash received? |
|---|---|---|
| **Add to loan** | Records more money lent; **increases** debt | No |
| **Record repayment** | Records money actually repaid; **decreases** debt | Yes |
| **Apply credit** | Records an allowance, substitution, discount, write-off or forgiveness; **decreases** debt | **No** |

The amounts are strictly positive in input forms; direction is determined by
the operation. Each operation may include a date and notes. The loan history
retains them separately, and total cash received excludes applied credits.

`outstanding = original principal + additional money lent - cash repayments - applied credits`

Credits cannot exceed outstanding debt. Repayments cannot exceed outstanding
debt after credits. Editing original principal or removing an extra lending
event cannot reduce the total below already received repayments **plus** applied
credits. Credits can be removed (with confirmation) to correct a mistake;
removing them increases the amount owed. The existing loan's original amount,
prior repayment and advance records are unchanged by migration.

Additional lending and cash repayments can optionally link to matching
**posted** on-budget bank outflows/inflows. Pending, adjustment, duplicate
IOU links and unsupported currency conversions cannot be used. A non-cash
credit is never linked to a bank deposit, because no money was received.

Loan schedules continue to support open-ended, single-date, and weekly,
biweekly or monthly installments. Applied credits reduce the obligation and
are included when evaluating whether the scheduled debt has been satisfied,
but are **not** counted as repayments received. An IOU paid off partly by
credit is labeled **Settled with credit** rather than **Fully repaid**.
Reminders appear in the app only; no borrower messages or push alerts are sent.

## Existing users and migration

**All existing Money Lent records stay intact**, including data from
`0027_personal_loans.sql`. The profiles migration
`0028_borrower_profiles_goal_links.sql` groups legacy loans under a person
based on their stored borrower name; if two people share a name, you may
create another profile and move individual loans to it.

**New migration `0029_personal_loan_credits.sql` is additive.** It only
creates the `personal_loan_credits` table; it does not rewrite
`personal_loan_advances` or `personal_loan_repayments`.
Previous "Add credit" actions are *already recorded as additional lending*
and will now display under **Add to loan** and **Additional money lent**.
They are **not silently converted** to debt forgiveness. To correct a
previously mislabeled entry, review and remove the incorrect added-money
event as appropriate, then apply a new non-cash credit.

The system preserves borrower names, original loan records and repayment
references. **Back up your live SQLite database and its encryption key**
before updating the Docker image. Keep the same database volume, encryption
key, environment settings and Portainer configuration. If you already
record the loan as an Other Asset account, do not add it again to net worth.
