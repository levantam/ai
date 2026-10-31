import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface UsageWindow { pct: number; resetsAt: number } // pct 0-100, resetsAt epoch ms
export interface Usage { five_hour?: UsageWindow; seven_day?: UsageWindow; updatedAt: number }
export interface UsageState { usage: Usage | null; note?: string }

/** Optional second source: the cache the "Claude Usage" SwiftBar plugin keeps. Used only when it is fresh. */
export const USAGE_FILE = path.join(os.homedir(), '.claude-usage-bar', 'cache.json');
const TTL = 180_000;          // never ask Anthropic more often than this
const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';

export function parseUsage(raw: any, updatedAt: number): Usage | null {
  const win = (w: any): UsageWindow | undefined => {
    const pct = Number(w?.utilization), at = Date.parse(w?.resets_at);
    return Number.isFinite(pct) && Number.isFinite(at) ? { pct, resetsAt: at } : undefined;
  };
  const five_hour = win(raw?.five_hour), seven_day = win(raw?.seven_day);
  return five_hour || seven_day ? { five_hour, seven_day, updatedAt } : null;
}

export function readUsage(file = USAGE_FILE): Usage | null {
  try { return parseUsage(JSON.parse(fs.readFileSync(file, 'utf8')), fs.statSync(file).mtimeMs); } catch { return null; }
}

export interface Deps {
  now(): number;
  readFileUsage(): Usage | null;
  readToken(): Promise<string | null>;
  fetchJson(token: string): Promise<{ status: number; body: any; retryAfter?: number }>;
}

/**
 * Plan usage with no helper app. Order: a fresh SwiftBar cache (no network) -> our own recent result -> one request
 * to Anthropic's usage endpoint with the Claude Code login already on this machine. The token stays in memory
 * for the length of one request. It is never logged, stored or shown, and goes nowhere except that endpoint.
 */
export class UsageSource {
  private mem: Usage | null = null;
  private nextAt = 0;
  private note: string | undefined;
  private busy = false;
  constructor(private live: () => boolean, private d: Deps = realDeps()) {}

  state(): UsageState {
    const f = this.d.readFileUsage();
    const best = f && (!this.mem || f.updatedAt > this.mem.updatedAt) ? f : this.mem;
    return { usage: best, note: best ? undefined : this.note };
  }

  /** Fetches when due. Resolves true when new numbers arrived. Never throws. */
  async refresh(): Promise<boolean> {
    if (this.busy || !this.live()) return false;
    const now = this.d.now();
    const f = this.d.readFileUsage();
    if ((f && now - f.updatedAt < TTL) || now < this.nextAt || (this.mem && now - this.mem.updatedAt < TTL)) return false;
    this.busy = true;
    const retry = (ms: number, note: string) => { this.nextAt = now + ms; this.note = note; return false; };
    try {
      const token = await this.d.readToken();
      if (!token) return retry(5 * 60_000, 'Sign in to Claude Code, or allow VS Code to read its login in the keychain.');
      const r = await this.d.fetchJson(token);
      if (r.status === 200) {
        const u = parseUsage(r.body, this.d.now());
        if (!u) return retry(5 * 60_000, 'Anthropic returned usage in a format Tami does not know.');
        this.mem = u; this.note = undefined; this.nextAt = 0; return true;
      }
      if (r.status === 429) return retry(Math.max(60, r.retryAfter ?? 300) * 1000, 'Anthropic is rate limiting usage requests. Trying again soon.');
      if (r.status === 401 || r.status === 403) return retry(5 * 60_000, 'Claude Code login expired. Use Claude Code once to refresh it.');
      return retry(2 * 60_000, `Usage request failed (HTTP ${r.status}).`);
    } catch { return retry(2 * 60_000, 'Could not reach Anthropic.'); }
    finally { this.busy = false; }
  }
}

function realDeps(): Deps {
  return {
    now: () => Date.now(),
    readFileUsage: () => readUsage(),
    readToken: () => new Promise((resolve) => {
      const parse = (s: string) => { try { return JSON.parse(s)?.claudeAiOauth?.accessToken || null; } catch { return null; } };
      if (process.platform === 'darwin') {
        execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 5000 }, (err, out) => resolve(err ? null : parse(out)));
      } else {
        try { resolve(parse(fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8'))); } catch { resolve(null); }
      }
    }),
    fetchJson: async (token) => {
      const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) });
      return { status: res.status, body: await res.json().catch(() => null), retryAfter: Number(res.headers.get('retry-after')) || undefined };
    },
  };
}
