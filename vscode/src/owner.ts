import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Session } from './claude';

/**
 * Which live Claude sessions belong to THIS VS Code window?
 *  1. The session is a descendant of one of this window's terminals: it is ours.
 *  2. It was started from some other VS Code terminal (TERM_PROGRAM=vscode): it belongs to another window.
 *  3. It was started outside VS Code: it is ours only if its folder is inside one of our workspace folders.
 * A window never claims a session just because it is the newest one on the machine.
 */
export interface Probe {
  table(): Promise<Map<number, number>>;            // pid -> parent pid
  inVsCode(pid: number): Promise<boolean | undefined>; // was this process started from a VS Code integrated terminal? undefined = unknown
}

export function descendsFrom(pid: number, roots: Set<number>, parents: Map<number, number>): boolean {
  for (let p = pid, hops = 0; p > 1 && hops < 32; hops++) {
    if (roots.has(p)) return true;
    const next = parents.get(p);
    if (next === undefined || next === p) return false;
    p = next;
  }
  return false;
}

const inside = (cwd: string, folders: string[]) => folders.map((f) => f.replace(/[\\/]+$/, '')).some((f) => f && (cwd === f || cwd.startsWith(f + path.sep)));

export async function ownedSessions(all: Session[], terminalPids: number[], folders: string[], probe: Probe = realProbe): Promise<Session[]> {
  const roots = new Set(terminalPids.filter((n) => Number.isFinite(n)));
  const parents = roots.size ? await probe.table().catch(() => new Map<number, number>()) : new Map<number, number>();
  const mine: Session[] = [];
  for (const s of all) {
    if (roots.size && descendsFrom(s.pid, roots, parents)) { mine.push(s); continue; }
    if ((await probe.inVsCode(s.pid)) === true) continue;       // another window's terminal
    if (inside(s.cwd, folders)) mine.push(s);                     // started elsewhere: go by folder
  }
  return mine;
}

// ---- real process probe (macOS and Linux; elsewhere everything is "unknown" and the folder rule applies)
const seen = new Map<number, boolean | undefined>();
const run = (cmd: string, args: string[]) => new Promise<string>((resolve, reject) =>
  execFile(cmd, args, { timeout: 4000, maxBuffer: 8 << 20 }, (e, out) => (e ? reject(e) : resolve(out))));

export const realProbe: Probe = {
  async table() {
    const out = await run('ps', ['-axo', 'pid=,ppid=']);
    const m = new Map<number, number>();
    for (const line of out.split('\n')) { const [a, b] = line.trim().split(/\s+/).map(Number); if (a && !isNaN(b)) m.set(a, b); }
    return m;
  },
  async inVsCode(pid) {
    if (seen.has(pid)) return seen.get(pid);
    let v: boolean | undefined;
    try {
      if (process.platform === 'linux') v = /(^|\0)TERM_PROGRAM=vscode(\0|$)/.test(fs.readFileSync(`/proc/${pid}/environ`, 'utf8'));
      else if (process.platform === 'darwin') v = /(^|\s)TERM_PROGRAM=vscode(\s|$)/.test(await run('ps', ['eww', '-p', String(pid), '-o', 'command=']));
    } catch { v = undefined; }
    seen.set(pid, v);        // a process never changes where it was started from
    return v;
  },
};
