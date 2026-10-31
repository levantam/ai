/**
 * Admin PIN: the Vietnam date and hour, ddMMyyyyHH. At 12:xx on 31 Oct 2026 the PIN is 3110202612.
 * It changes every hour. Note this is a gate for the interface, not security: anyone who knows the rule can work it out.
 */
const VN_OFFSET = 7 * 3600_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function pinFor(t: number): string {
  const d = new Date(t + VN_OFFSET);
  return `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}${pad(d.getUTCHours())}`;
}

/**
 * The entry is right if it matches the PIN of the hour you opened the box in, or of the hour you pressed Enter in,
 * so typing across the top of an hour does not lock you out.
 */
export function checkPin(entry: string, openedAt: number, submittedAt: number): boolean {
  const e = (entry ?? '').trim();
  return e.length === 10 && (e === pinFor(openedAt) || e === pinFor(submittedAt));
}
