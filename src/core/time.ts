/**
 * The world clock (ADR-0022, ADR-0024). 1.0 = one day; each day starts at dawn.
 * Night runs from 0.625 (21:00) to the next dawn (06:00).
 */
export const DUSK = 0.625;
export const DAWN_HOUR = 6;

export function dayOf(t: number): number {
  return Math.floor(t);
}

export function isNight(t: number): boolean {
  return t - Math.floor(t) >= DUSK;
}

/** Next time strictly after t at the given fraction of a day. */
export function nextAt(t: number, fraction: number): number {
  const base = Math.floor(t) + fraction;
  return base > t ? base : base + 1;
}

/** "Day 3, 14:20" */
export function clockLabel(t: number): string {
  const minutes = Math.floor((t - Math.floor(t)) * 24 * 60 + DAWN_HOUR * 60) % (24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `Day ${dayOf(t) + 1}, ${hh}:${mm}`;
}
