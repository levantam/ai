import * as path from 'path';
import * as vscode from 'vscode';
import { MAX_CHILDREN, parentOf, treeToJson, Var } from './dap';

const PATHS_KEY = 'debug.paths';
const MAX_PATHS = 20;
const CMDS = new Set(['continue', 'pause', 'stepOver', 'stepInto', 'stepOut', 'restart', 'stop']);

const sec = (id: string, title: string, body: string, open = true) =>
  `<details class="dsec" data-dsec="${id}"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;

/** The debug-mode body of the Tami sidebar (GoLand / Visual Studio style: toolbar, frames, variables, breakpoints). */
export const DEBUG_BODY = `<div class="dbg">
  <div class="dhead"><b>Debug</b><button id="exit" title="Back to Tami"><i class="codicon codicon-close"></i> Exit</button></div>
  <div class="launch">
    <select id="cfg" title="Launch configuration"></select>
    <button id="start" title="Start"><i class="codicon codicon-debug-start"></i></button>
  </div>
  <div class="tools">
    <button data-cmd="continue" title="Continue (F5)"><i class="codicon codicon-debug-continue"></i></button>
    <button data-cmd="pause" title="Pause"><i class="codicon codicon-debug-pause"></i></button>
    <button data-cmd="stepOver" title="Step over (F10)"><i class="codicon codicon-debug-step-over"></i></button>
    <button data-cmd="stepInto" title="Step into (F11)"><i class="codicon codicon-debug-step-into"></i></button>
    <button data-cmd="stepOut" title="Step out (Shift+F11)"><i class="codicon codicon-debug-step-out"></i></button>
    <button data-cmd="restart" title="Restart"><i class="codicon codicon-debug-restart"></i></button>
    <button data-cmd="stop" title="Stop"><i class="codicon codicon-debug-stop"></i></button>
  </div>
  <div id="sess" class="sess">No debug session</div>
  ${sec('frames', 'Call stack', '<select id="threads" title="Goroutine / thread"></select><ul id="frames" class="list"></ul>')}
  ${sec('vars', 'Variables', '<div id="locals"></div><input id="path" list="ac" placeholder="Watch an object path, e.g. user.profile.items[0].name" autocomplete="off" spellcheck="false"><datalist id="ac"></datalist><div id="paths"></div>')}
  ${sec('bps', 'Breakpoints', '<ul id="bps" class="list"></ul>', false)}
</div>`;

/**
 * Debug mode of the Tami sidebar. It is a controller, not a view: the sidebar swaps its page for DEBUG_BODY while `active`.
 * Everything goes through the Debug Adapter Protocol (threads / stackTrace / scopes / variables / evaluate / completions),
 * so Go (delve), .NET (netcoredbg, vsdbg), Node, Python... all work. Saved watch paths live in workspaceState.
 */
export class DebugController {
  private forced = false;
  private dismissed = false;
  private sel?: { threadId: number; frameId?: number };       // chosen in the Tami panel; cleared on every new stop
  private cur?: { threadId?: number; frameId?: number };      // what evaluate / locals use
  private frames: { id: number; path?: string; line: number }[] = [];
  private was = false;

  /** post: message to the webview. rerender: swap the sidebar page. reveal: show the Tami tab. */
  constructor(private ctx: vscode.ExtensionContext, private post: (m: unknown) => void, private rerender: () => void, private reveal: () => void) {
    ctx.subscriptions.push(
      vscode.debug.onDidStartDebugSession(() => { this.dismissed = false; this.sel = undefined; this.reveal(); this.sync(); }),
      vscode.debug.onDidTerminateDebugSession(() => { this.sel = undefined; this.sync(); }),
      vscode.debug.onDidChangeActiveStackItem(() => { this.sel = undefined; void this.pushAll(); }),
      vscode.debug.onDidChangeBreakpoints(() => this.pushBps()),
    );
  }

  get active(): boolean { return this.forced || (!!vscode.debug.activeDebugSession && !this.dismissed); }
  open() { this.forced = true; this.dismissed = false; this.sync(); }
  private exit() { this.forced = false; this.dismissed = true; this.sync(); }
  /** Mode flips => full re-render; otherwise just refresh the data. */
  private sync() { const a = this.active; if (a !== this.was) { this.was = a; this.rerender(); } else if (a) void this.pushAll(); }
  markShown() { this.was = this.active; }

  async handle(m: any) {
    switch (m.type) {
      case 'ready': await this.pushAll(); break;
      case 'exit': this.exit(); break;
      case 'cmd': if (CMDS.has(m.id)) await vscode.commands.executeCommand(`workbench.action.debug.${m.id}`); break;
      case 'start': await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.find((f) => f.name === m.folder), m.name); break;
      case 'thread': this.sel = { threadId: m.id }; await this.pushAll(); break;
      case 'frame': { this.sel = { threadId: m.threadId, frameId: m.id }; await this.pushAll(); await this.goto(this.frames.find((f) => f.id === m.id)); break; }
      case 'addPath': await this.setPaths([m.path, ...this.paths().filter((p) => p !== m.path)].slice(0, MAX_PATHS)); await this.evalOne(m.path); break;
      case 'removePath': await this.setPaths(this.paths().filter((p) => p !== m.path)); break;
      case 'eval': await this.evalOne(m.path); break;
      case 'expand': this.post({ type: 'children', ref: m.ref, vars: await this.children(m.ref).catch(() => []) }); break;
      case 'json': await this.copyJson(m.path); break;
      case 'complete': this.post({ type: 'completions', items: await this.complete(m.text).catch(() => []) }); break;
      case 'bpGo': { const b = vscode.debug.breakpoints[m.i]; if (b instanceof vscode.SourceBreakpoint) await this.goto({ path: b.location.uri.fsPath, line: b.location.range.start.line + 1 }); break; }
      case 'bpToggle': { const b = vscode.debug.breakpoints[m.i]; if (b instanceof vscode.SourceBreakpoint) { vscode.debug.removeBreakpoints([b]); vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(b.location, !b.enabled, b.condition, b.hitCondition, b.logMessage)]); } break; }
      case 'bpRemove': { const b = vscode.debug.breakpoints[m.i]; if (b) vscode.debug.removeBreakpoints([b]); break; }
    }
  }

  private async goto(f?: { path?: string; line: number }) {
    if (!f?.path) return;
    try { await vscode.window.showTextDocument(vscode.Uri.file(f.path), { selection: new vscode.Range(f.line - 1, 0, f.line - 1, 0) }); } catch { /* source not on disk */ }
  }

  private paths(): string[] { return this.ctx.workspaceState.get<string[]>(PATHS_KEY, []); }
  private async setPaths(p: string[]) { await this.ctx.workspaceState.update(PATHS_KEY, p); this.pushState(); }

  private async pushAll() { this.pushState(); this.pushBps(); await this.pushStack(); await this.pushLocals(); await this.evalAll(); }

  private pushState() {
    const s = vscode.debug.activeDebugSession;
    this.post({ type: 'state', session: s ? { name: s.name, type: s.type } : null, paused: this.cur?.frameId !== undefined, configs: this.configs(), paths: this.paths() });
  }

  /** launch.json configurations and compounds of every workspace folder. */
  private configs(): { folder: string; name: string }[] {
    const out: { folder: string; name: string }[] = [];
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      const c = vscode.workspace.getConfiguration('launch', f.uri);
      for (const k of ['configurations', 'compounds'] as const) for (const x of c.get<{ name?: string }[]>(k, [])) if (x?.name) out.push({ folder: f.name, name: x.name });
    }
    return out;
  }

  private pushBps() {
    const items = vscode.debug.breakpoints.map((b, i) => b instanceof vscode.SourceBreakpoint
      ? { i, label: path.basename(b.location.uri.fsPath), line: b.location.range.start.line + 1, enabled: b.enabled, cond: b.condition }
      : b instanceof vscode.FunctionBreakpoint ? { i, label: b.functionName, enabled: b.enabled, cond: b.condition } : null).filter(Boolean);
    this.post({ type: 'bps', items });
  }

  /** Goroutines / threads and the frames of the selected one. Fails quietly while the program is running. */
  private async pushStack() {
    const s = vscode.debug.activeDebugSession;
    this.frames = [];
    if (!s) { this.cur = undefined; this.post({ type: 'stack', threads: [], frames: [] }); return; }
    let threads: { id: number; name: string }[] = [];
    try { threads = (await s.customRequest('threads')).threads ?? []; } catch { /* adapter without threads */ }
    const it = vscode.debug.activeStackItem;
    const threadId = this.sel?.threadId ?? it?.threadId ?? threads[0]?.id;
    let frames: any[] = [];
    if (threadId !== undefined) { try { frames = (await s.customRequest('stackTrace', { threadId, levels: 50 })).stackFrames ?? []; } catch { /* running */ } }
    const frameId = this.sel?.frameId ?? (!this.sel && it instanceof vscode.DebugStackFrame ? it.frameId : frames[0]?.id);
    this.cur = { threadId, frameId };
    this.frames = frames.map((f) => ({ id: f.id, path: f.source?.path, line: f.line }));
    this.post({ type: 'stack', threadId, frameId, threads: threads.map((t) => ({ id: t.id, name: t.name })),
      frames: frames.map((f) => ({ id: f.id, name: f.name, file: f.source?.name ?? '', line: f.line })) });
  }

  /** Scopes (Locals, Arguments, Globals...) of the selected frame; the page expands them lazily. */
  private async pushLocals() {
    const s = vscode.debug.activeDebugSession, fid = this.cur?.frameId;
    let scopes: { name: string; ref: number }[] = [];
    if (s && fid !== undefined) { try { scopes = ((await s.customRequest('scopes', { frameId: fid })).scopes as any[]).map((x) => ({ name: x.name, ref: x.variablesReference })); } catch { /* running */ } }
    this.post({ type: 'locals', scopes });
  }

  private async evaluate(expression: string) {
    const s = vscode.debug.activeDebugSession;
    if (!s) throw new Error('No debug session');
    const r = await s.customRequest('evaluate', { expression, frameId: this.cur?.frameId, context: 'watch' });
    return { name: expression, value: String(r.result), type: r.type as string | undefined, ref: Number(r.variablesReference) || 0 } as Var;
  }
  private async evalOne(path: string) {
    try { const v = await this.evaluate(path); this.post({ type: 'value', path, result: v.value, kind: v.type, ref: v.ref }); }
    catch (e: any) { this.post({ type: 'value', path, error: e?.message || String(e) }); }
  }
  private async evalAll() { for (const p of this.paths()) await this.evalOne(p); }

  private async children(ref: number): Promise<Var[]> {
    const s = vscode.debug.activeDebugSession;
    if (!s || !ref) return [];
    const r = await s.customRequest('variables', { variablesReference: ref });
    return (r.variables as any[]).slice(0, MAX_CHILDREN).map((v) => ({ name: String(v.name), value: String(v.value), type: v.type, ref: Number(v.variablesReference) || 0 }));
  }

  private async copyJson(path: string) {
    try {
      const json = await treeToJson(await this.evaluate(path), (ref) => this.children(ref));
      await vscode.env.clipboard.writeText(JSON.stringify(json, null, 2));
      vscode.window.setStatusBarMessage(`Tami: copied ${path} as JSON`, 3000);
    } catch (e: any) { vscode.window.showWarningMessage(`Tami: ${e?.message || e}`); }
  }

  /** Full-path suggestions for the text typed so far. DAP `completions` when the adapter has it, else the parent's children. */
  private async complete(text: string): Promise<string[]> {
    const s = vscode.debug.activeDebugSession, fid = this.cur?.frameId;
    if (!s || !text.trim()) return [];
    const parent = parentOf(text), prefix = text.slice(parent ? parent.length + 1 : 0);
    try {
      const r = await s.customRequest('completions', { text, column: text.length + 1, frameId: fid });
      const items = (r.targets as any[]).map((t) => text.slice(0, text.length - (t.length ?? prefix.length)) + (t.text ?? t.label));
      if (items.length) return [...new Set(items)].slice(0, 50);
    } catch { /* adapter has no completions: fall through */ }
    if (!parent) {
      if (fid === undefined) return [];
      const names: string[] = [];
      for (const sc of ((await s.customRequest('scopes', { frameId: fid })).scopes as any[]).slice(0, 2)) names.push(...(await this.children(sc.variablesReference)).map((v) => v.name));
      return names.filter((n) => n.startsWith(text)).slice(0, 50);
    }
    const p = await this.evaluate(parent);
    const sep = text[parent.length];
    return (await this.children(p.ref)).filter((v) => v.name.startsWith(prefix))
      .map((v) => sep === '[' ? `${parent}[${/^\d+$/.test(v.name) ? v.name : JSON.stringify(v.name)}]` : `${parent}.${v.name}`).slice(0, 50);
  }
}
