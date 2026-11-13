/**
 * A value that changes at a steady rate and is only computed when read (ADR-0007).
 * Hunger, shelter need, age, wear: stored as (value, rate, since), never ticked.
 */
export interface LazyValue {
  readonly lazy: true;
  readonly value: number;
  /** Change per day. */
  readonly rate: number;
  /** World time at which `value` was exact. */
  readonly since: number;
  readonly min: number;
  readonly max: number;
}

export function lazy(value: number, rate: number, since: number, min = -Infinity, max = Infinity): LazyValue {
  return { lazy: true, value: clamp(value, min, max), rate, since, min, max };
}

export function isLazy(v: unknown): v is LazyValue {
  return typeof v === "object" && v !== null && (v as { lazy?: unknown }).lazy === true;
}

export function readLazy(v: LazyValue, t: number): number {
  return clamp(v.value + v.rate * (t - v.since), v.min, v.max);
}

/** Same value at time t, continuing at a new rate. Used when circumstances change. */
export function withRate(v: LazyValue, t: number, rate: number): LazyValue {
  return lazy(readLazy(v, t), rate, t, v.min, v.max);
}

/** Set the value at time t, keeping the rate. */
export function withValue(v: LazyValue, t: number, value: number): LazyValue {
  return lazy(value, v.rate, t, v.min, v.max);
}

/**
 * When will the value reach `target`, looking forward from `now`?
 * Returns undefined if it never will (wrong direction, zero rate, or outside min/max).
 * This is what turns lazy values into threshold events.
 */
export function timeToReach(v: LazyValue, target: number, now: number): number | undefined {
  const current = readLazy(v, now);
  if (current === target) return now;
  if (v.rate === 0) return undefined;
  if (target > current !== v.rate > 0) return undefined;
  if (target > v.max || target < v.min) return undefined;
  return now + (target - current) / v.rate;
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
