/** Preserve upstream behavior by default until a backup and migration review are complete. */
export type ReconciliationMode = 'legacy' | 'observe';
export function reconciliationMode(value: string | undefined): ReconciliationMode {
  return value === 'observe' ? 'observe' : 'legacy';
}
export function shouldAutoAlignStartingBalance(mode: ReconciliationMode, bankCurrent: number | null): boolean {
  return mode === 'legacy' && bankCurrent !== null;
}
