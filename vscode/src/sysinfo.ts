import * as os from 'os';
import { execFile } from 'child_process';

const times = () => os.cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + Object.values(c.times).reduce((s, v) => s + v, 0) }), { idle: 0, total: 0 });
let prev = times();

/** Memory in use, bytes. os.freemem() counts macOS cache as used (always ~95%), so macOS asks vm_stat: active + wired + compressed. */
function used(total: number): Promise<number> {
  if (process.platform !== 'darwin') return Promise.resolve(total - os.freemem());
  return new Promise((ok) => execFile('vm_stat', (err, out) => {
    const n = (k: string) => Number(new RegExp(k + ':\\s+(\\d+)').exec(out)?.[1]);
    const page = Number(/page size of (\d+)/.exec(out)?.[1]);
    const pages = n('Pages active') + n('Pages wired down') + n('Pages occupied by compressor');
    ok(err || !page || isNaN(pages) ? total - os.freemem() : pages * page);
  }));
}

/** CPU % since the last call, RAM % and GB. */
export async function sample() {
  const now = times(), total = os.totalmem(), u = await used(total);
  const cpu = Math.round((1 - (now.idle - prev.idle) / Math.max(1, now.total - prev.total)) * 100);
  prev = now;
  return { cpu, ram: Math.round((u / total) * 100), usedGb: u / 2 ** 30, totalGb: total / 2 ** 30 };
}

/** Top 3 CPU users, "Name 85%". */
function hogs(): Promise<string> {
  return new Promise((ok) => execFile('ps', ['-Aceo', 'pcpu,comm', '-r'], (err, out) =>
    ok(err ? '' : out.split('\n').slice(1, 4).map((l) => l.trim().replace(/^(\S+)\s+(.*)$/, '$2 $1%')).join(', '))));
}

/** "Cool down": macOS `purge` flushes the file cache and inactive memory (asks for the admin password). CPU cannot be forced down, so the busiest apps are listed instead. */
export async function cooldown(): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('Clearing memory is only supported on macOS.');
  const before = await sample();
  await new Promise<void>((ok, fail) => execFile('osascript', ['-e', 'do shell script "purge" with administrator privileges'], (e) => e ? fail(e) : ok()));
  const after = await sample(), busy = await hogs();
  return `RAM ${before.ram}% → ${after.ram}% (freed ${Math.max(0, before.usedGb - after.usedGb).toFixed(1)} GB).` + (busy ? ` Busiest: ${busy}.` : '');
}
