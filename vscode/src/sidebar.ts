import * as vscode from 'vscode';
import { Action, Group, loadConfig, Row, runAction, Section, SidebarConfig } from './tools';
import { currentMascot, esc, mascots, renderPage } from './page';
import { liveSessions, readRun } from './claude';
import { ownedSessions } from './owner';
import { Rec, button, checkIn, checkOut, checkoutAt, currentCall, dur, hhmm, isIn, WORK_MS } from './attendance';
import { UsageSource } from './usage';
import { checkPin } from './admin';

const QUICK_MAX = 4;
const itemKey = (g: Group, a: Action) => `${g.id}/${a.label}`;

type Block = { key: string; html: (mv: string) => string };

export class SidebarProvider implements vscode.WebviewViewProvider {
  view?: vscode.WebviewView;
  edit = false; // reorder mode
  private actions: Action[] = []; // flat list; data-run index points here
  private lastOrder: Record<string, string[]> = {}; // effective order per list, rebuilt on every render
  private timer?: NodeJS.Timeout;
  private quickKeys: string[] = []; // pinned item keys (group id / label), max QUICK_MAX
  private pinned = new Set<string>();
  private sectionKeys: string[] = [];
  private cards: { id: string; def: boolean }[] = []; // every collapsible card and its default state
  private usageSrc = new UsageSource(() => vscode.workspace.getConfiguration('tami').get<boolean>('ai.usageLive', false));
  constructor(private ctx: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
    };
    this.render();
    this.startClock();
    view.onDidChangeVisibility(() => { if (view.visible) { this.render(); this.startClock(); } else { this.stopPolling(); this.stopClock(); } }); // refresh info (branch etc.)
    view.onDidDispose(() => { this.stopPolling(); this.stopClock(); });
    view.webview.onDidReceiveMessage(async (m) => {
      switch (m.type) {
        case 'run': if (this.actions[m.index]) await runAction(this.actions[m.index]); break;
        case 'ready': this.pushAgents(); this.pushCall(); break;
        case 'callAnswer': await this.callAnswer(m.kind); break;
        case 'answer': await vscode.commands.executeCommand('workbench.action.terminal.focus'); break;
        case 'toggle': await this.ctx.workspaceState.update(`group.${m.id}`, m.open); break;
        case 'admin': await this.adminToggle(); break;
        case 'adminSignIn': await this.adminSignIn(); break;
        case 'move': if (!this.isAdmin()) break; await this.move(m.store, m.key, m.dir); break;
        case 'secToggle': await this.ctx.workspaceState.update('sec.' + m.key, m.folded); break;
        case 'editQuick': await this.pickQuick(); break;
        case 'pin': if (!this.isAdmin()) break; await this.togglePin(m.key); break;
        case 'editDone': this.setEdit(false); break;
        case 'resetOrder': if (!this.isAdmin()) break; await this.resetOrder(); break;
        case 'setOption':
          await vscode.workspace.getConfiguration('tami').update(m.key, m.value, vscode.ConfigurationTarget.Global);
          break;
      }
    });
  }

  render() {
    if (!this.view) return;
    this.actions = [];
    this.view.webview.html = renderPage(this.view.webview, this.ctx, 'sidebar', this.body(), ['sidebar.js']);
    this.startPolling();
  }
  private startPolling() {
    this.stopPolling();
    if (this.live()) { this.timer = setInterval(() => this.pushAgents(), 2000); this.timer.unref?.(); }
  }

  setEdit(on: boolean) { this.edit = on; this.render(); }

  // ---- admin: without the PIN only Tami Options and AI are shown, and sorting and quick actions are locked
  private lastAdmin?: boolean;
  private guestPool: string[] = [];   // the quick actions a guest has available: the admin's saved picks plus the guest-flagged ones
  isAdmin(): boolean { return this.ctx.globalState.get<boolean>('admin', false) === true; }
  needAdmin(): void { void vscode.window.showInformationMessage('Tami: this needs the admin PIN. Sign in from Tami Options.'); }
  toggleEdit() { if (!this.isAdmin()) return this.needAdmin(); this.setEdit(!this.edit); }
  /** Sign in with the PIN, or sign out when already signed in. */
  /** Opens the PIN box, only when nobody is signed in. Reached by tapping the mascot five times. */
  async adminSignIn() { if (!this.isAdmin()) await this.adminToggle(); }
  async adminToggle() {
    if (this.isAdmin()) {
      await this.ctx.globalState.update('admin', false); this.edit = false; this.syncAdmin(true);
      void vscode.window.showInformationMessage('Tami: admin signed out.');
      return;
    }
    for (;;) {
      const openedAt = Date.now();
      const pin = await vscode.window.showInputBox({ title: 'Tami admin', prompt: 'Enter the admin PIN', password: true, ignoreFocusOut: true });
      if (pin === undefined) return;
      if (checkPin(pin, openedAt, Date.now())) break;
      // a wrong PIN gets a proper dialog, not a toast that fades away; "Try again" reopens the box
      const again = await vscode.window.showErrorMessage('Wrong PIN', { modal: true, detail: 'That PIN is not correct, so the admin view stays locked.' }, 'Try again');
      if (again !== 'Try again') return;
    }
    await this.ctx.globalState.update('admin', true); this.syncAdmin(true);
    void vscode.window.showInformationMessage('Tami: admin signed in.');
  }
  /** Keeps the menu context and the page in step with the admin state, including a sign-in or out done in another window. */
  syncAdmin(force = false) {
    const a = this.isAdmin();
    if (!force && a === this.lastAdmin) return;
    this.lastAdmin = a; if (!a) this.edit = false;
    void (vscode.commands as { executeCommand?: Function }).executeCommand?.('setContext', 'tami.admin', a);
    this.render();
  }
  /** What this person may see: everything for the admin (the development-only section only in development mode), nothing from the config otherwise. */
  private devSections(cfg: SidebarConfig): Section[] {
    const dev = this.ctx.extensionMode === vscode.ExtensionMode.Development;
    return cfg.sections.filter((s) => !s.devOnly || dev);
  }
  private visibleSections(cfg: SidebarConfig): Section[] { return this.isAdmin() ? this.devSections(cfg) : []; }

  // ---- ordering: user order is saved per list (blocks, groups of a section, items of a group); new entries go last
  private ordered<T>(store: string, list: T[], key: (t: T) => string): T[] {
    const saved = this.ctx.globalState.get<string[]>('order.' + store, []);
    const rank = (t: T) => { const i = saved.indexOf(key(t)); return i < 0 ? 1e6 + list.indexOf(t) : i; };
    const out = [...list].sort((a, b) => rank(a) - rank(b));
    this.lastOrder[store] = out.map(key);
    return out;
  }
  private async move(store: string, key: string, dir: number) {
    const arr = [...(this.lastOrder[store] ?? [])];
    const i = arr.indexOf(key), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await this.ctx.globalState.update('order.' + store, arr);
    this.render();
  }
  async resetOrder() {
    for (const k of this.ctx.globalState.keys().filter((k) => k.startsWith('order.') || k === 'quick')) await this.ctx.globalState.update(k, undefined);
    this.render();
  }
  /** up/down arrows, only in reorder mode */
  private pin(g: Group, a: Action): string {
    const key = itemKey(g, a), on = this.pinned.has(key), full = !on && this.pinned.size >= QUICK_MAX;
    return `<button class="mv pin ${on ? 'on' : ''}" data-pin="${esc(key)}" ${full ? 'disabled' : ''} title="${on ? 'Remove from quick run' : full ? 'Quick run is full (4)' : 'Add to quick run'}">${ico(on ? 'pinned' : 'pin')}</button>`;
  }
  private mv(store: string, key: string, i: number, n: number, extra = ''): string {
    if (!this.edit) return '';
    const b = (dir: number, icon: string, off: boolean) =>
      `<button class="mv" data-move="${esc(JSON.stringify({ store, key, dir }))}" ${off ? 'disabled' : ''}>${ico(icon)}</button>`;
    return `<span class="mvs">${extra}${b(-1, 'arrow-up', i === 0)}${b(1, 'arrow-down', i === n - 1)}</span>`;
  }

  /** Pin or unpin an item as a quick-run button. Saved per user; the first save replaces the sidebar.json defaults. */
  private async togglePin(key: string) {
    const cur = [...this.quickKeys], i = cur.indexOf(key);
    if (i >= 0) cur.splice(i, 1); else if (cur.length < QUICK_MAX) cur.push(key); else return;
    await this.ctx.globalState.update('quick', cur);
    this.render();
  }

  /** Native multi-select picker over every item in the sidebar. Picks become the quick-run buttons (max QUICK_MAX). */
  async pickQuick() {
    const cfg = loadConfig(this.ctx), admin = this.isAdmin();
    type Pick = vscode.QuickPickItem & { key?: string };
    const items: Pick[] = [];
    const add = (g: Group, a: Action) => items.push({ label: (a.icon ? `$(${this.sub(a.icon)}) ` : '') + this.sub(a.label), description: this.sub(a.meta ?? ''), detail: a.type === 'todo' ? 'Not wired up yet' : undefined, key: itemKey(g, a) });
    let limit: number;
    if (admin) {
      for (const sec of this.visibleSections(cfg)) for (const g of sec.groups ?? []) { items.push({ label: g.title, kind: vscode.QuickPickItemKind.Separator }); for (const a of g.items) add(g, a); }
      limit = QUICK_MAX;
    } else {
      // A guest can only show or hide the buttons already on their row, so no name from a hidden section is revealed that is not already a button.
      const byKey = new Map<string, [Group, Action]>();
      for (const sec of this.devSections(cfg)) for (const g of sec.groups ?? []) for (const a of g.items) byKey.set(itemKey(g, a), [g, a]);
      for (const k of this.guestPool) { const e = byKey.get(k); if (e) add(e[0], e[1]); }
      limit = items.length;
    }
    const qp = vscode.window.createQuickPick<Pick>();
    qp.canSelectMany = true;
    qp.title = admin ? 'Quick actions under the mascot' : 'Show or hide quick actions';
    const hint = admin ? `Pick up to ${QUICK_MAX}. Each runs with one click.` : 'Tick the quick actions to show.';
    qp.placeholder = hint;
    qp.items = items;
    let ok = items.filter((i) => i.key && this.quickKeys.includes(i.key));
    qp.selectedItems = ok;
    let busy = false;
    qp.onDidChangeSelection((sel) => {
      if (busy) return;
      if (sel.length > limit) { busy = true; qp.selectedItems = ok; busy = false; qp.placeholder = `Only ${limit} fit. Untick one first.`; return; }
      ok = [...sel]; qp.placeholder = hint;
    });
    qp.onDidAccept(async () => {
      const chosen = ok.map((i) => i.key!);
      if (admin) {
        // keep the existing button order, then add new picks in the order they were ticked
        const next = [...this.quickKeys.filter((k) => chosen.includes(k)), ...chosen.filter((k) => !this.quickKeys.includes(k))];
        await this.ctx.globalState.update('quick', next);
      } else {
        await this.ctx.globalState.update('quick.guest.hide', this.guestPool.filter((k) => !chosen.includes(k)));   // the admin's own list is never touched
      }
      qp.hide(); this.render();
    });
    qp.onDidHide(() => qp.dispose());
    qp.show();
  }

  // ---- AI progress
  private aiCfg = () => vscode.workspace.getConfiguration('tami');
  private aiOn = () => this.aiCfg().get<string>('ai.provider', 'none') === 'claude-code' && this.aiCfg().get<boolean>('ai.showProgress', true);
  private stopPolling() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  private claude = () => this.aiCfg().get<string>('ai.provider', 'none') === 'claude-code';
  private usageOn = () => this.claude() && (this.aiCfg().get<boolean>('ai.showUsage', true) || this.usageCard());
  private countdownOn = () => vscode.workspace.getConfiguration('tami').get<boolean>('attendance.countdown', true);
  private usageCard = () => this.claude() && this.aiCfg().get<boolean>('ai.usageOnCard', false);
  private live = () => this.aiOn() || this.usageOn();
  private pushUsage() {
    const st = this.usageSrc.state();
    this.view?.webview.postMessage({ type: 'usage', usage: st.usage, note: st.note });
  }
  /** This window's own Claude sessions only: found through this window's terminals, so another VS Code window never leaks in. */
  private async pushRun() {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const all = liveSessions();
    let owned: ReturnType<typeof liveSessions> | undefined;
    if (all.length) {
      const pids = (await Promise.all(vscode.window.terminals.map((t) => t.processId))).filter((n): n is number => typeof n === 'number');
      owned = await ownedSessions(all, pids, folders);
    }
    this.view?.webview.postMessage({ type: 'agents', agents: readRun(folders[0], Date.now(), owned), noWorkspace: false });
  }

  private pushAgents() {
    if (!this.live() || !this.view?.visible) return;
    if (this.aiOn()) void this.pushRun();
    if (this.usageOn()) {
      this.pushUsage();
      this.usageSrc.refresh().then((changed) => { if (changed) this.pushUsage(); });
    }
  }

  private aiSection(mv: string): string {
    const cfg = this.aiCfg();
    const provider = cfg.get<string>('ai.provider', 'none');
    const opts = [['none', 'None', 0], ['claude-code', 'Claude Code', 0], ['cursor', 'Cursor (coming soon)', 1], ['gemini', 'Gemini (coming soon)', 1]] as const;
    const select = opts.map(([id, label, off]) => `<option value="${id}" ${id === provider ? 'selected' : ''} ${off ? 'disabled' : ''}>${label}</option>`).join('');
    let body = `<div class="row">${ico('hubot')}<span class="k">Assistant</span><select id="aiProvider">${select}</select></div>`;
    if (provider === 'claude-code') {
      const show = cfg.get<boolean>('ai.showProgress', true);
      body += `<label class="row">${ico('pulse')}<span class="k">Show progress under mascot</span><input type="checkbox" id="aiProgress" ${show ? 'checked' : ''}></label>`;
      const showUsage = cfg.get<boolean>('ai.showUsage', true), onCard = cfg.get<boolean>('ai.usageOnCard', false);
      body += `<label class="row">${ico('graph')}<span class="k">Show usage</span><input type="checkbox" id="aiUsage" ${showUsage ? 'checked' : ''}></label>`;
      body += `<label class="row">${ico('layout-sidebar-right')}<span class="k">Usage on mascot card</span><input type="checkbox" id="aiUsageCard" ${onCard ? 'checked' : ''}></label>`;
      if (showUsage) body += `<div id="usage" class="usage"><div class="uempty">Reading usage…</div></div>`;
    }
    const open = this.ctx.workspaceState.get<boolean>('group.ai', true);
    return this.sec('ai', 'AI', '', mv, `<details class="group ai" data-id="ai" ${open ? 'open' : ''}><summary>${ico('hubot')}<span>AI Assistant</span>${ico('chevron-down', 'chev')}</summary>${body}</details>`);
  }

  /** Fills {{placeholders}} in sidebar.json labels, icons and meta text. */
  private sub(s: string): string {
    const b = button(this.rec(), Date.now());
    const vars: Record<string, string> = {
      host: `${vscode.version}`,
      workspace: vscode.workspace.workspaceFolders?.map((f) => f.name).join(', ') ?? '—',
      branch: gitBranch() ?? '—',
      version: this.ctx.extension.packageJSON.version,
      attendance: b.meta, attendanceLabel: b.label, attendanceIcon: b.icon,
    };
    return s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  }

  // ---- check in / check out
  private clock?: NodeJS.Timeout;
  private startClock() { this.stopClock(); this.clock = setInterval(() => this.pushCall(), 5000); this.clock.unref?.(); }
  private stopClock() { if (this.clock) clearInterval(this.clock); this.clock = undefined; }
  private rec = () => this.ctx.globalState.get<Rec>('attendance');
  private pushCall() {
    if (!this.view?.visible) return;
    const now = Date.now(), r = this.rec();
    this.view.webview.postMessage({ type: 'call', call: currentCall(r, now) });
    const at = checkoutAt(r, now);
    this.view.webview.postMessage({ type: 'checkout', at, clock: at ? hhmm(at) : null, inClock: at && r?.inAt ? hhmm(r.inAt) : null });
  }
  private async save(r: Rec) { await this.ctx.globalState.update('attendance', r); this.render(); }
  private async callAnswer(kind: 'checkin' | 'checkout') { const now = Date.now(); await this.save(kind === 'checkin' ? checkIn(now, this.rec()) : checkOut(this.rec(), now)); }
  /** The check-in item. Records check in; once checked in the same item is "Check out" and records that. */
  async checkin() {
    const now = Date.now(), r = this.rec();
    if (isIn(r, now)) {
      const worked = now - r.inAt;
      if (worked < WORK_MS) {           // leaving early: ask first, because a check-out cannot be taken back from here
        const pick = await vscode.window.showWarningMessage(`You have worked ${dur(worked)} of 8h`,
          { modal: true, detail: `Checking out now is ${dur(WORK_MS - worked)} early (you checked in at ${hhmm(r.inAt)}). Check out anyway?` }, 'Check out');
        if (pick !== 'Check out') return;
      }
      const at = Date.now();             // time passed while the dialog was open
      await this.save(checkOut(r, at));
      vscode.window.showInformationMessage(`Tami: checked out at ${hhmm(at)}. You worked ${dur(at - r.inAt)}.`);
      return;
    }
    await this.save(checkIn(now, this.rec()));
    vscode.window.showInformationMessage(`Tami: checked in at ${hhmm(now)}. You will get a check-out call at ${hhmm(now + WORK_MS)}.`);
  }

  /** A collapsible section: click the header to fold it. State is remembered per workspace. */
  private sec(key: string, title: string, extra: string, mv: string, body: string): string {
    const folded = this.ctx.workspaceState.get<boolean>('sec.' + key, false);
    return `<section class="${folded ? 'folded' : ''}" data-sec="${esc(key)}"><div class="sechead" data-sectoggle role="button" tabindex="0" aria-expanded="${!folded}"><span>${esc(title)}</span>${extra}${mv}${ico('chevron-down', 'secchev')}</div><div class="secbody">${body}</div></section>`;
  }

  /**
   * Collapse every card inside the sections (AI Assistant, Tami Options, beGroup Utils...), or expand them all when
   * they are all collapsed. Section headers are left alone, except that a folded section is opened so the result is visible.
   */
  async toggleSections() {
    const open = (g: { id: string; def: boolean }) => this.ctx.workspaceState.get<boolean>('group.' + g.id, g.def);
    const anyOpen = this.cards.some(open);
    for (const g of this.cards) await this.ctx.workspaceState.update('group.' + g.id, !anyOpen);
    for (const k of this.sectionKeys) await this.ctx.workspaceState.update('sec.' + k, false);
    this.render();
  }

  private act(a: Action): number { return this.actions.push(a) - 1; }

  private body(): string {
    const cfg = loadConfig(this.ctx);
    const admin = this.isAdmin(), secs = this.visibleSections(cfg);
    this.lastAdmin = admin;
    const sub = (s: string) => this.sub(s);

    // Quick-run buttons. The admin's picks (saved under "quick") are KEPT when they sign out: a guest still sees those buttons, though not the
    // sections and items behind them. A guest also always gets what the config marks "guest" (Check in), and can hide any button on their own row.
    const pool = new Map<string, Action>(), guestKeys: string[] = [];
    for (const sec of this.devSections(cfg)) for (const g of sec.groups ?? []) for (const a of g.items) { pool.set(itemKey(g, a), a); if (a.guest) guestKeys.push(itemKey(g, a)); }
    const saved = this.ctx.globalState.get<string[]>('quick');
    const adminKeys = (saved ?? (admin ? [...pool].filter(([, a]) => a.quick).map(([k]) => k) : [])).filter((k) => pool.has(k)).slice(0, QUICK_MAX);
    this.guestPool = [...adminKeys, ...guestKeys.filter((k) => !adminKeys.includes(k))];
    const hidden = new Set(this.ctx.globalState.get<string[]>('quick.guest.hide', []));
    this.quickKeys = admin ? adminKeys : this.guestPool.filter((k) => !hidden.has(k));
    this.pinned = new Set(this.quickKeys);
    let quick = this.quickKeys.map((k) => pool.get(k)!);
    if (admin && saved === undefined && !quick.length) quick = cfg.hero.actions ?? [];

    const timed = vscode.workspace.getConfiguration('tami').get<boolean>('timeTheme', false);
    const flyCode = vscode.workspace.getConfiguration('tami').get<boolean>('workingCode', true);
    const speech = vscode.workspace.getConfiguration('tami').get<boolean>('showSpeech', true);
    const hero = `<div class="hero" data-admin="${admin ? 1 : 0}" data-mood="idle" data-code="${flyCode ? 1 : 0}" data-say="${speech ? 1 : 0}" data-time="${timed ? timeOfDay(cfg.hero.time) : 'plain'}" data-fixed="${!timed || (cfg.hero.time && cfg.hero.time !== 'auto') ? 1 : 0}"><div class="fx"><i class="meteor m1"></i><i class="meteor m2"></i><i class="meteor m3"></i><i class="bird b1"></i><i class="bird b2"></i><i class="bird b3"></i></div>${speech ? '<div class="say" aria-live="polite"><b>Tami</b><span class="msg"></span></div>' : ''}${this.usageCard() || this.countdownOn() ? `<div class="corner">${this.usageCard() ? '<div id="ubadge" class="ubadge" hidden></div>' : ''}${this.countdownOn() ? '<div id="cbadge" class="cbadge" hidden><b></b><span></span></div>' : ''}</div>` : ''}__STAGE__
      <div class="callinfo" role="status"><b>Claude</b><span><span class="ct">needs your answer</span><i class="dots"><i></i><i></i><i></i></i></span></div>${this.aiOn() ? '<div id="agents" class="agents"><div class="rings"></div><div class="alist"></div></div>' : ''}<div class="callbtns"><button type="button" class="cbtn answer" data-call="answer" aria-label="Answer"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></button></div>
      <div class="actions">${quick.map((a) => `<button data-run="${this.act(a)}" title="${esc(sub(a.label))}">${ico(sub(a.icon ?? ''))}<span>${esc(sub(a.label))}</span></button>`).join('')}</div>
      <button type="button" class="qedit" data-quick="edit">${ico('edit')}<span>${quick.length ? 'Change quick actions' : 'Choose quick actions'}</span></button>
    </div>`;

    const [curMascot] = currentMascot(this.ctx);
    const mascotOpts = Object.entries(mascots(this.ctx)).map(([k, v]) => `<option value="${esc(k)}" ${k === curMascot ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
    const tami = vscode.workspace.getConfiguration('tami');
    const auto = tami.get<boolean>('mascotAuto', false), mins = Math.max(1, tami.get<number>('mascotAutoMinutes', 15));
    const blocks: Block[] = [
      { key: 'options', html: (mv) => {
        const open = this.ctx.workspaceState.get<boolean>('group.options', true);
        return this.sec('options', 'Tami', '', mv, `<details class="group opts" data-id="options" ${open ? 'open' : ''}><summary>${ico('sparkle')}<span>Tami Options</span>${ico('chevron-down', 'chev')}</summary>
      ${admin ? `<button type="button" class="item" id="adminBtn" title="Sign out of admin">${ico('unlock')}<span>Admin: sign out</span></button>` : ''}
      <label class="item">${ico('smiley')}<span>Mascot</span><select id="mascot">${mascotOpts}</select></label>
      <label class="item">${ico('clock')}<span>Background follows time of day</span><input type="checkbox" id="timeTheme" ${timed ? 'checked' : ''}></label>
      <label class="item">${ico('comment')}<span>Show Tami's message</span><input type="checkbox" id="showSpeech" ${speech ? 'checked' : ''}></label>
      <label class="item">${ico('code')}<span>Flying code while working</span><input type="checkbox" id="workingCode" ${flyCode ? 'checked' : ''}></label>
      <label class="item">${ico('watch')}<span>Check-out time on mascot card</span><input type="checkbox" id="checkoutCard" ${this.countdownOn() ? 'checked' : ''}></label>
      <label class="item">${ico('sync')}<span>Random every ${mins} min</span><input type="checkbox" id="mascotAuto" ${auto ? 'checked' : ''}></label>
    </details>`); } },
      { key: 'ai', html: (mv) => this.aiSection(mv) },
      ...secs.map((s): Block => ({ key: 'sec:' + s.title, html: (mv) => this.section(s, sub, mv) })),
    ];
    const list = this.ordered('blocks', blocks, (b) => b.key);
    this.sectionKeys = list.map((b) => b.key);
    this.cards = [{ id: 'options', def: true }, { id: 'ai', def: true }, ...secs.flatMap((s) => (s.groups ?? []).map((g) => ({ id: g.id, def: g.open !== false })))];
    const bar = this.edit && admin
      ? `<div class="editbar"><span>${ico('list-ordered')} Reordering</span><button data-edit="resetOrder">Reset</button><button data-edit="editDone">Done</button></div>` : '';
    return hero + bar + list.map((b, i) => b.html(this.mv('blocks', b.key, i, list.length))).join('');
  }

  private section(s: Section, sub: (v: string) => string, mv: string): string {
    const extra = s.badge ? `<span class="synced">● ${esc(s.badge)}</span>` : '';
    const rows = s.rows ? `<div class="card">${s.rows.map((r) => row(r, sub)).join('')}</div>` : '';
    const store = 'groups:' + s.title;
    const groups = s.groups
      ? this.ordered(store, s.groups, (g) => g.id).map((g, i, a) => this.group(g, this.mv(store, g.id, i, a.length), sub)).join('') : '';
    return this.sec('sec:' + s.title, s.title, extra, mv, rows + groups);
  }

  private group(g: Group, mv: string, sub: (v: string) => string): string {
    const open = this.ctx.workspaceState.get<boolean>(`group.${g.id}`, g.open !== false);
    const store = 'items:' + g.id;
    const items = this.ordered(store, g.items, (a) => a.label).map((a, i, arr) => {
      const meta = a.metaIcon ? ico(a.metaIcon, 'meta') : a.meta ? `<span class="meta ${a.metaStyle ?? ''}">${esc(sub(a.meta))}</span>` : '';
      if (this.edit) return `<div class="item">${ico(sub(a.icon ?? ''))}<span title="${esc(sub(a.label))}">${esc(sub(a.label))}</span>${this.mv(store, a.label, i, arr.length, this.pin(g, a))}</div>`;
      return `<button class="item" data-run="${this.act(a)}" title="${esc(a.command ?? '')}">${ico(sub(a.icon ?? ''))}<span>${esc(sub(a.label))}</span>${meta}</button>`;
    }).join('');
    return `<details class="group" data-id="${esc(g.id)}" ${open ? 'open' : ''}><summary>${ico(g.icon)}<span>${esc(g.title)}</span>${mv}${ico('chevron-down', 'chev')}</summary>${items}</details>`;
  }
}

/** morning 05-12, afternoon 12-18, night otherwise; or a fixed value from sidebar.json */
function timeOfDay(fixed?: string): string {
  if (fixed && fixed !== 'auto') return fixed;
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : 'night';
}

function ico(name?: string, cls = ''): string {
  return name ? `<i class="codicon codicon-${esc(name)} ${cls}"></i>` : '';
}

function row(r: Row, sub: (v: string) => string): string {
  const v = sub(r.value);
  let value: string;
  if (r.progress != null) {
    const pct = Math.round(Math.max(0, Math.min(1, r.progress)) * 100);
    value = `<span class="bar"><span style="width:${pct}%"></span></span><span class="v mono">${esc(v)}</span>`;
  } else {
    value = `<span class="v ${r.style ?? ''}" title="${esc(v)}">${r.style === 'chip' ? ico(r.valueIcon) : ''}${esc(v)}</span>`;
  }
  return `<div class="row">${ico(r.icon)}<span class="k">${esc(r.label)}</span>${value}</div>`;
}

function gitBranch(): string | undefined {
  try {
    const git = vscode.extensions.getExtension<any>('vscode.git')?.exports?.getAPI(1);
    return git?.repositories?.[0]?.state?.HEAD?.name;
  } catch { return undefined; }
}
