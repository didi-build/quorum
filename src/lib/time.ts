/** Canonical UTC timestamps for D1 (3-digit milliseconds, `Date.prototype.toISOString()`). */

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoFrom(date: Date): string {
  return date.toISOString();
}
