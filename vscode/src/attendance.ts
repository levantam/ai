/**
 * Check-in / check-out reminders. Pure functions: the clock is always passed in, so every rule is testable.
 * All times are Vietnam time (UTC+7, no daylight saving), whatever time zone this computer is set to.
 * The record resets at midnight there: yesterday's check-in never carries into today.
 */

export const WORK_MS = 8 * 3600_000;          // the check-out call rings this long after checking in
export const MORNING_START = 8 * 60 + 30;     // 08:30, minutes after midnight
export const MORNING_END = 10 * 60;           // 10:00
const VN_OFFSET = 7 * 3600_000;

export interface Rec { day: string; inAt?: number; outAt?: number }
export interface Call { kind: 'checkin' | 'checkout'; name: string; text: string }

const pad = (n: number) => String(n).padStart(2, '0');
/** Shift so the UTC getters read Vietnam wall-clock time. */
const vn = (t: number) => new Date(t + VN_OFFSET);
export const dayKey = (t: number) => { const d = vn(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const hhmm = (t: number) => { const d = vn(t); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
export const dur = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`; };

/** Checked in today (Vietnam date) and not checked out yet. */
export const isIn = (r: Rec | undefined, now: number): r is Rec & { inAt: number } => !!r?.inAt && !r.outAt && r.day === dayKey(now);

/**
 * Which call should be ringing right now, if any. A call keeps ringing until the user answers it.
 *  - checked in today and 8 hours have passed: "check out"
 *  - not checked in today, between 08:30 and 10:00: "check in"
 */
export function currentCall(r: Rec | undefined, now: number): Call | null {
  if (isIn(r, now)) {
    return now >= r.inAt + WORK_MS
      ? { kind: 'checkout', name: 'Check out', text: `8 hours since you checked in at ${hhmm(r.inAt)}` } : null;
  }
  const d = vn(now), minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (r?.day === dayKey(now) && r.inAt) return null;          // already checked in (and out) today
  return minutes >= MORNING_START && minutes < MORNING_END ? { kind: 'checkin', name: 'Check in', text: "You haven't checked in yet" } : null;
}

/** A second check-in the same day keeps the first time; if you had already checked out, it reopens the day (drops the check-out). */
export const checkIn = (now: number, r?: Rec): Rec => (r?.day === dayKey(now) && r.inAt ? { day: r.day, inAt: r.inAt } : { day: dayKey(now), inAt: now });
export const checkOut = (r: Rec | undefined, now: number): Rec => ({ ...(r ?? { day: dayKey(now) }), outAt: now });

/** The one sidebar button: "Check in" until you have, then "Check out". */
export function button(r: Rec | undefined, now: number): { label: string; icon: string; meta: string } {
  if (isIn(r, now)) return { label: 'Check out', icon: 'sign-out', meta: `in ${hhmm(r.inAt)}` };
  return { label: 'Check in', icon: 'sign-in', meta: r?.day === dayKey(now) && r.outAt ? `out ${hhmm(r.outAt)}` : 'not yet' };
}

/** When the 8 hours are up, for the countdown on the mascot card. null when not checked in. */
export const checkoutAt = (r: Rec | undefined, now: number): number | null => (isIn(r, now) ? r.inAt + WORK_MS : null);
