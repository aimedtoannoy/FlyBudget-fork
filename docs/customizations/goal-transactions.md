# Linked bank transactions for savings goals

The **Goals** page now provides **Link transactions** in each goal’s action
menu. This lets the user tie actual posted bank transactions to goal progress.

- The goal’s **manual saved amount** remains unchanged.
- A linked posted inflow adds to the tracked goal amount; an outflow subtracts.
- Set how much of the transaction applies to this goal, up to its unassigned
  value. A transaction may be split across multiple goals, but the total
  allocated across them cannot exceed its posted amount.
- If the goal is linked to one account, only transactions in that account can
  be associated. You cannot link both sides of the same bank transfer to the
  **same goal** or move a goal to an incompatible account until those links
  are removed.
- Pending items, balance adjustments, split parents and transactions that do
  not have a usable amount in the budget currency are excluded.
- Remove a goal link at any time; the goal progress recomputes without editing
  the bank transaction. Removing an underlying bank transaction cascades the
  link away as well.

**Prevent double counting:** The “manual saved amount” is a starting / manual
figure. If it already reflects a historical deposit, linking that deposit
again will add it again. Adjust the manual amount as needed when transitioning
an existing goal to transaction-based tracking.

These references do not transfer funds, earmark cash in accounts, change
budget allocations, or initiate bank operations. Goal targets and progress
remain planning information.
