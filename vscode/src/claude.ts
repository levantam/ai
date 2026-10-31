import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'waiting' | 'done'; // waiting = Claude is asking the user something
  steps: number; // tool calls so far, -1 when unknown
  activity: string;
}

const STALE_MS = 60_000;          // no transcript writes for this long and no end_turn = not running any more
const PENDING_MS = 15 * 60_000;   // ...unless a tool call is still in flight (long Bash, waiting on subagents)
const SESSION_MAX_AGE = 30 * 60_000;
const PROMPT_SCAN_BYTES = 4 * 1024 * 1024;
const MAX_COUNT_BYTES = 8 * 1024 * 1024;

export function projectDir(workspace: string): string {
  return path.join(os.homedir(), '.claude', 'projects', workspace.replace(/[^a-zA-Z0-9]/g, '-'));
}

export interface Session { pid: number; id: string; cwd: string; name: string; status: string; waitingFor?: string }

/** Every live Claude session on this machine, from ~/.claude/sessions/<pid>.json. Which window owns each one is decided in owner.ts. */
export function liveSessions(dir = path.join(os.homedir(), '.claude', 'sessions'), alive: (pid: number) => boolean = isAlive): Session[] {
  const out: Session[] = [];
  let files: string[]; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return out; }
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (d.sessionId && d.pid && alive(Number(d.pid))) {
        const cwd = String(d.cwd || '');
        out.push({ pid: Number(d.pid), id: String(d.sessionId), cwd, name: String(d.name || path.basename(cwd) || 'Claude'), status: String(d.status || ''), waitingFor: d.waitingFor ? String(d.waitingFor) : undefined });
      }
    } catch { /* half-written or foreign file */ }
  }
  return out;
}
function isAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } }

/**
 * What this window shows. `owned` is the list of sessions that belong to this window (see owner.ts):
 *  - an array: only those sessions are read, so another window's Claude never shows here
 *  - undefined: Claude Code keeps no session list on this machine, so fall back to the open folder's own transcripts
 * A question is only written to a transcript after you answer it, so "waiting" comes from the session list instead.
 */
export function readRun(workspace?: string, now = Date.now(), owned?: Session[]): AgentInfo[] {
  const rows = readRows(workspace, now, owned);
  const waits: AgentInfo[] = (owned ?? []).filter((x) => x.status === 'waiting' && x.waitingFor)
    .map((x) => ({ id: x.id, name: x.name, type: 'main', status: 'waiting', steps: -1, activity: 'Needs your answer' }));
  if (!waits.length) return rows;
  const mainId = rows[0]?.type === 'main' ? rows[0].id : undefined;
  if (waits.some((w) => w.id === mainId)) rows[0] = { ...rows[0], status: 'waiting', activity: 'Needs your answer' };
  rows.splice(rows.length ? 1 : 0, 0, ...waits.filter((w) => w.id !== mainId));  // other sessions of this window that are asking, right after the main row
  return rows.slice(0, 8);
}

function readRows(workspace?: string, now = Date.now(), owned?: Session[]): AgentInfo[] {
  try {
    let found: { dir: string; f: string; t: number } | undefined;
    if (owned) {
      // Only this window's own sessions. If several are open in its terminals, follow the one that was active most recently.
      for (const x of owned) {
        const dir = projectDir(x.cwd), file = path.join(dir, x.id + '.jsonl');
        let t = 0; try { t = fs.statSync(file).mtimeMs; } catch { continue; }
        if (now - t <= SESSION_MAX_AGE && (!found || t > found.t)) found = { dir, f: x.id + '.jsonl', t };
      }
    } else if (workspace) {
      found = newestSession([projectDir(workspace)], now);        // no session list on this machine: the open folder's own transcripts, never other folders
    }
    if (!found) return [];
    const { dir, f, t } = found;
    const newest = { f, t };
    const mainFile = path.join(dir, newest.f);
    const base = newest.f.replace(/\.jsonl$/, '');
    const since = lastPromptTime(mainFile);
    const out: AgentInfo[] = [describe(mainFile, now, base, 'Claude', 'main', false)];

    const sub = path.join(dir, base, 'subagents');
    if (fs.existsSync(sub)) {
      const started: { a: AgentInfo; t: number }[] = [];
      for (const m of fs.readdirSync(sub).filter((x) => x.endsWith('.meta.json'))) {
        const id = m.replace(/\.meta\.json$/, '');
        const file = path.join(sub, id + '.jsonl');
        if (!fs.existsSync(file)) continue;
        const t = firstTime(file);
        if (t < since - 2000) continue; // belongs to an earlier question
        const meta = JSON.parse(fs.readFileSync(path.join(sub, m), 'utf8'));
        started.push({ t, a: describe(file, now, id, meta.name || meta.description || meta.agentType || id, meta.agentType || 'agent', true, meta.finished === true) });
      }
      started.sort((x, y) => x.t - y.t).forEach((s) => out.push(s.a));
    }
    return out.slice(0, 8);
  } catch { return []; } // no Claude Code data for this workspace
}

function newestSession(dirs: string[], now: number): { dir: string; f: string; t: number } | undefined {
  let best: { dir: string; f: string; t: number } | undefined;
  for (const dir of dirs) {
    let files: string[]; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const t = fs.statSync(path.join(dir, f)).mtimeMs;
      if (now - t <= SESSION_MAX_AGE && (!best || t > best.t)) best = { dir, f, t };
    }
  }
  return best;
}

/** Timestamp of the user's latest real question (not tool results, notifications or slash-command noise). */
const promptCache = new Map<string, { sig: string; t: number }>();
function lastPromptTime(file: string): number {
  const st = fs.statSync(file), sig = `${st.mtimeMs}:${st.size}`, hit = promptCache.get(file);
  if (hit?.sig === sig) return hit.t;
  const t = scanPromptTime(file, st.size);
  promptCache.set(file, { sig, t });
  return t;
}
function scanPromptTime(file: string, size: number): number {
  const lines = readTail(file, size, PROMPT_SCAN_BYTES);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"type":"user"')) continue;
    let o: any; try { o = JSON.parse(lines[i]); } catch { continue; }
    if (o.type !== 'user' || o.isSidechain || o.isMeta || !o.message) continue;
    const c = o.message.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') : '';
    if (!text.trim() || text.trimStart().startsWith('<')) continue;
    const t = Date.parse(o.timestamp);
    if (!isNaN(t)) return t;
  }
  return 0;
}

const firstCache = new Map<string, number>();   // the first line of a transcript never changes
function firstTime(file: string): number {
  const c = firstCache.get(file); if (c) return c;
  const t = readFirstTime(file);
  if (t) firstCache.set(file, t);
  return t;
}
function readFirstTime(file: string): number {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(8192); const n = fs.readSync(fd, buf, 0, 8192, 0);
    const m = /"timestamp":"([^"]+)"/.exec(buf.toString('utf8', 0, n));
    return m ? Date.parse(m[1]) : 0;
  } finally { fs.closeSync(fd); }
}

interface Tail { ended: boolean; tool: string; inFlight: boolean; asking: boolean }
const tailCache = new Map<string, { sig: string; v: Tail }>();
function parseTail(file: string, st: fs.Stats, type: string): Tail {
  const sig = `${st.mtimeMs}:${st.size}`, hit = tailCache.get(file);
  if (hit?.sig === sig) return hit.v;
  const lines = readTail(file, st.size, 256 * 1024);
  let ended = false, tool = '', seenLast = false;
  for (let i = lines.length - 1; i >= 0 && !(seenLast && tool); i--) {
    if (!lines[i].includes('"type":"assistant"')) continue;
    let o: any; try { o = JSON.parse(lines[i]); } catch { continue; }
    const msg = o.message; if (!msg) continue;
    if (!seenLast) { seenLast = true; ended = msg.stop_reason === 'end_turn'; }
    if (!tool && Array.isArray(msg.content)) {
      const use = [...msg.content].reverse().find((b: any) => b.type === 'tool_use');
      if (use) tool = use.name;
    }
  }
  const v = { ended, tool, inFlight: toolInFlight(lines), asking: type === 'main' && pendingQuestion(lines) };
  tailCache.set(file, { sig, v });
  return v;
}

/** True when the newest message is a tool call whose result has not been written yet. */
function toolInFlight(lines: string[]): boolean {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const user = l.includes('"type":"user"'), asst = l.includes('"type":"assistant"');
    if (!user && !asst) continue;
    let o: any; try { o = JSON.parse(l); } catch { continue; }
    if (o.isSidechain || !o.message) continue;
    return o.type === 'assistant' && Array.isArray(o.message.content) && o.message.content.some((b: any) => b.type === 'tool_use');
  }
  return false;
}

/** Tool calls so far. Reads only the bytes added since the last look instead of the whole file every poll. */
const stepCache = new Map<string, { size: number; n: number }>();
function countSteps(file: string, size: number): number {
  if (size > MAX_COUNT_BYTES) return -1;
  let c = stepCache.get(file); if (!c || c.size > size) c = { size: 0, n: 0 };
  if (c.size < size) {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(size - c.size); fs.readSync(fd, buf, 0, buf.length, c.size);
      const text = buf.toString('latin1');   // byte-safe: the marker is ASCII, so a split multibyte char cannot hide it
      let n = c.n, i = 0; const key = '"type":"tool_use"';
      while ((i = text.indexOf(key, i)) >= 0) { n++; i += key.length; }
      c = { size, n };
    } finally { fs.closeSync(fd); }
    stepCache.set(file, c);
  }
  return c.n;
}

function describe(file: string, now: number, id: string, name: string, type: string, wantSteps: boolean, finished = false): AgentInfo {
  const st = fs.statSync(file);
  const t = parseTail(file, st, type);
  // Finished agents are flagged in their meta file and end by calling the handback tool, not with end_turn.
  if (t.asking) return { id, name, type, status: 'waiting', steps: -1, activity: 'Needs your answer' };
  const quiet = now - st.mtimeMs;
  const running = !finished && !t.ended && t.tool !== 'SubagentHandback' && quiet < (t.inFlight ? PENDING_MS : STALE_MS);
  const steps = wantSteps ? countSteps(file, st.size) : -1;
  return { id, name, type, status: running ? 'running' : 'done', steps, activity: running ? (t.tool ? `Running ${t.tool}` : 'Thinking') : 'Done' };
}

const ASK_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']); // tools that block until the user answers

/** True when the latest tool call is a question to the user that has no answer yet. */
function pendingQuestion(lines: string[]): boolean {
  const answered = new Set<string>();
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const isUser = line.includes('"type":"user"'), isAsst = line.includes('"type":"assistant"');
    if (!isUser && !isAsst) continue;
    let o: any; try { o = JSON.parse(line); } catch { continue; }
    if (o.isSidechain || !o.message) continue;
    const c = o.message.content;
    if (o.type === 'user') {
      if (!Array.isArray(c)) return false;                       // user typed something new: any question is moot
      for (const b of c) if (b.type === 'tool_result') answered.add(b.tool_use_id);
      else if (b.type === 'text' && !String(b.text).trimStart().startsWith('<')) return false;
    } else if (Array.isArray(c)) {
      const use = c.find((b: any) => b.type === 'tool_use');
      if (use) return ASK_TOOLS.has(use.name) && !answered.has(use.id);
    }
  }
  return false;
}

/** Last complete JSONL lines of a file without reading all of it. */
function readTail(file: string, size: number, bytes: number): string[] {
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.min(size, bytes), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    return len < size ? lines.slice(1) : lines; // first line is cut mid-way
  } finally { fs.closeSync(fd); }
}
