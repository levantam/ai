import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Mascot { label: string; aspect: string; layers: string[]; armOrigin?: string;
  lids?: { color: string; w: string; h: string; pos: [string, string][] } }
export function mascots(ctx: vscode.ExtensionContext): Record<string, Mascot> {
  return JSON.parse(fs.readFileSync(path.join(ctx.extensionPath, 'media', 'mascots', 'mascots.json'), 'utf8'));
}
export function currentMascot(ctx: vscode.ExtensionContext): [string, Mascot] {
  const all = mascots(ctx);
  const id = vscode.workspace.getConfiguration('tami').get<string>('mascot', 'robot');
  const key = all[id] ? id : Object.keys(all)[0];
  return [key, all[key]];
}

/** A random mascot id different from the current one (the current one if it is the only choice). */
export function nextMascot(ids: string[], cur: string, rnd: () => number = Math.random): string {
  const others = ids.filter((i) => i !== cur);
  return others.length ? others[Math.floor(rnd() * others.length)] : cur;
}

export type Surface = 'sidebar' | 'avatar';
export function animateEnabled(): boolean {
  return vscode.workspace.getConfiguration('tami').get<boolean>('avatar.animate', true);
}

/** "1024 / 1078" -> 0.9498 */
function arNum(a: string): number { const [w, h] = a.split('/').map(Number); return w / h; }

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Shared page shell: CSP, styles, bot stage with persisted state, then surface-specific body + scripts. */
export function renderPage(
  webview: vscode.Webview,
  ctx: vscode.ExtensionContext,
  surface: Surface,
  body: string,
  extraScripts: string[] = [],
): string {
  const media = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'media', f));
  const nonce = Math.random().toString(36).slice(2);
  const init = JSON.stringify({ animate: animateEnabled() });
  const scripts = ['bot.js', ...extraScripts].map((f) => `<script nonce="${nonce}" src="${media(f)}"></script>`).join('');
  const [mid, m] = currentMascot(ctx);
  const layers = m.layers.map((l) =>
    `<img class="${l}" src="${media(`mascots/${mid}/${l}.png`)}" alt="" draggable="false"${l === 'arm' && m.armOrigin ? ` style="transform-origin:${m.armOrigin}"` : ''}>`).join('');
  const lids = m.lids ? m.lids.pos.map(([l, t]) =>
    `<span class="lid" style="left:${l};top:${t};width:${m.lids!.w};height:${m.lids!.h};background:${m.lids!.color}"></span>`).join('') : '';
  const stage = `<div id="stage"><div id="bot" style="--ar:${arNum(m.aspect)}"><div class="rig">${layers}${lids}</div></div><img id="work" class="work" src="${media('working.png')}" alt="" draggable="false"></div>`;
  const content = body.includes('__STAGE__') ? body.replace('__STAGE__', stage) : stage + body;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${media('codicon.css')}"><link rel="stylesheet" href="${media('styles.css')}"></head>
<body class="${surface}">
${content}
<script id="bot-state" type="application/json">${init}</script>
${scripts}</body></html>`;
}
