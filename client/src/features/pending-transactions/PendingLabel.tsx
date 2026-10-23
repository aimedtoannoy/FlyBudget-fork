/** FlyBudget-fork customization: bank authorizations visible before posting. */
export function PendingLabel({ pending }: { pending?: number }) {
  if (pending !== 1) return null;
  return (
    <span
      title="This bank transaction has not posted yet and may change"
      className="inline-flex shrink-0 items-center rounded-md bg-caution-subtle px-1.5 py-0.5 text-[10px] font-medium text-caution"
    >
      Pending
    </span>
  );
}
