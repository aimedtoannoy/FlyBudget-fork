# Money Lent and borrower financial profiles (FlyBudget fork)

Money Lent now groups multiple **separate named loans** under one person’s financial
profile. Each loan retains its own amount, lending date, repayment arrangement,
transaction references and repayment history. Creating this module does not alter
the original bank or budget records.

## Profiles

Open **Money Lent** → **Add person**. A profile has a name and private notes.
Select the profile to see its own loan list and total still owed. You can rename
the profile or move an existing loan between profiles via **Edit loan**.

**Existing installation migration:** Previously created IOUs are preserved
and automatically associated with a profile based on their existing borrower
name when Money Lent first loads after migration. Repayment records, IDs,
balances and original loan dates remain unchanged. Names that match after
trimming whitespace and ignoring capitalization are initially grouped.
If two distinct people share a name, create a second profile and move the
appropriate loans; profiles are identified by IDs, not names.

## Separate loans, credits and repayments

Inside a profile choose **New loan**. Enter a loan title or purpose, original
principal, lending date, and an optional one-time or installment schedule.
Loans are not combined: two loans for the same person have different histories.

Choose **Add credit** on a loan to record **additional money you lend**. This
increases the total principal and outstanding balance without modifying the
original lending amount. Choose **Record repayment** for payments received;
repayments reduce the outstanding balance. Both actions support manual entry
or an optional link to an existing posted bank transaction.

For a transaction link, select the posted bank outflow for additional money
lent or the posted bank inflow for a repayment. The amount and date must match
the bank transaction exactly. Original principal can also be linked to a
posted outflow of the original amount. Pending bank entries, transfers between
your own accounts, adjustments and duplicate IOU links are rejected.

Review a loan’s **History** to see original principal, additional advances,
repayments and bank reference status. Incorrect manual events can be removed
(with a balance-protection check); removing an IOU record never deletes its
bank counterpart. Editing the loan’s schedule, title or borrower profile
does not erase those histories.

## Account and net-worth boundaries

These profiles are **informational receivable records**, not actual checking
accounts or duplicate bank accounts. IOUs do not automatically appear as
assets in net worth or as cash available to budget. A transfer from your
checking to the borrower should continue to exist in your normal bank register,
with normal accounting and categories. Linking one here is a reference only.

If you already record a personal receivable as an **Other Asset** account,
take care not to include the same debt twice in your financial reports.
Loans use the budget currency. Existing posted transactions without a valid
budget-currency conversion cannot be linked.

The borrower names, profile notes and loan notes use the app’s at-rest
encryption mechanism. An original loan’s title uses the same mechanism.
In-app reminders are available for scheduled payments; this feature does not
send texts, emails, push notifications or messages to other people.

## Data integrity and installation

Migration `0028_borrower_profiles_goal_links.sql` creates new profile,
advance and goal-link tables and adds nullable links to existing loans.
No existing loan rows are deleted or re-created.

Preserve the existing Docker / Portainer database volume and encryption key.
Back up the SQLite database **and the key** before deploying new images.
Never reset the fork to upstream; merge and reconcile upstream migrations.
