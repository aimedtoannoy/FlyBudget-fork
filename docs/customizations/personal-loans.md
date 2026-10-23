# Money Lent / IOUs (FlyBudget fork)

Money Lent is a standalone record of personal loans **you make to someone else**.
It does not move money, adjust balances or create new bank transactions.

## Create and manage

Open **Money Lent** in the sidebar and choose **Add loan**. Enter:

- Borrower, principal amount and date you lent the money.
- **Open-ended:** no deadline.
- **One payment:** a single due date.
- **Installments:** first due date, amount per installment, weekly / every two weeks / monthly.
- Optional notes containing terms, agreement reference, or relevant context.
- Optional **in-app reminders** for scheduled payments within seven days or overdue.

You can edit a loan to change its repayment arrangement without losing the payment
history. You can record partial cash payments, or select a **posted bank deposit**
from the last 180 days. The latter is a *link* to an existing transaction, not a
second deposit, and always needs explicit review. Pending transactions, transfers,
off-budget accounts, adjustments, and deposits already linked to another payment
are not eligible. Amount/date must match the posted deposit.

The app shows outstanding, received, next unpaid date, overdue amount, and payment
history. You can remove an incorrect payment or delete the loan after confirmation.

## Important accounting limits

Money Lent is an **informational IOU subledger**. Unlike FlyBudget's actual
Accounts, IOUs do not appear in net worth, or automatically change "To Budget".
Original lending and repayment transactions should continue to be recorded in the
normal account registers. This feature does not rewrite their categories or
accounting treatment. If you already track a receivable in an Other Asset account,
do **not** add this IOU balance to your net worth a second time.

The reminders are shown **only while viewing Money Lent**. There are currently
no push alerts, scheduled background jobs, outbound texts or borrower communications.
The notes field is text, not a file or signature attachment facility.

Amounts are in the app's budget currency. Deposit links require a usable value in
that currency; foreign-currency deposits without a conversion are excluded.
Bank data remains on your self-hosted installation. Borrower names and notes use
the same at-rest encryption mechanism as the application's other sensitive fields.

## Development / deployment

Implementation is isolated under `server/src/features/personal-loans/` and
`client/src/features/personal-loans/`; migrations are additive. Preserve the
existing `/data` SQLite volume, secrets and Portainer environment variables.
Back up the database before deploying a new image.
