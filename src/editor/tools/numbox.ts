/**
 * Number boxes whose number must stay a number (a score effect's amount, a dice range's ends): emptied (or not a
 * number), the box keeps its last value instead of saving a blank ("Score × null" would set a score to 0).
 */
export function keepNum(v: unknown, set: (n: number) => void): void {
  if (typeof v === 'number' && Number.isFinite(v)) set(v);
}

/** Once the box is left, it shows the number kept (an emptied box fills in again). */
export function shown(e: Event & { currentTarget: HTMLInputElement }, n: number | undefined): void {
  if (n !== undefined && e.currentTarget.value !== String(n)) e.currentTarget.value = String(n);
}
