import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { customSection } from './custom';

/** Anything clickable: hero quick action or a group item. */
export interface Action {
  icon?: string;
  label: string;
  type: 'shell' | 'vscode' | 'url' | 'todo';
  command?: string;
  local?: boolean;   // only works on the author's machine: left out of the shared build (pack.py --share)
  guest?: boolean;   // shown as a quick action to everyone, signed in or not (the item's own section stays admin-only)
  quick?: boolean;   // group items: show as a quick-run button under the mascot by default
  fresh?: boolean;   // shell actions: always open a new terminal (for interactive sessions like claude)
  terminal?: string; // shell actions: terminal name (default "Tami"), so long-running envs get their own
  meta?: string;
  metaIcon?: string;
  metaStyle?: 'ok' | 'warn';
}
export interface Row { icon?: string; label: string; value: string; style?: 'mono' | 'accent' | 'chip'; valueIcon?: string; progress?: number }
export interface Group { id: string; icon?: string; title: string; open?: boolean; items: Action[] }
export interface Section { title: string; guest?: boolean; /* shown to guests too, not only admin */ devOnly?: boolean; /* shown only while the extension runs in development mode */ badge?: string; rows?: Row[]; groups?: Group[] }
export interface SidebarConfig {
  hero: { time?: 'auto' | 'morning' | 'afternoon' | 'night'; actions?: Action[] };
  sections: Section[];
}

export function loadConfig(ctx: vscode.ExtensionContext): SidebarConfig {
  const file = path.join(ctx.extensionPath, 'sidebar.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as SidebarConfig;
    cfg.sections.push(customSection(ctx));
    return cfg;
  } catch (e) {
    vscode.window.showErrorMessage(`Tami: cannot read sidebar.json (${(e as Error).message})`);
    return { hero: { actions: [] }, sections: [] };
  }
}

export async function runAction(a: Action): Promise<void> {
  switch (a.type) {
    case 'shell': {
      const name = a.terminal ?? 'Tami';
      const term = (!a.fresh && vscode.window.terminals.find((x) => x.name === name)) || vscode.window.createTerminal(name);
      term.show(true);
      term.sendText(a.command ?? '');
      return;
    }
    case 'vscode':
      await vscode.commands.executeCommand(a.command ?? '');
      return;
    case 'url':
      await vscode.env.openExternal(vscode.Uri.parse(a.command ?? ''));
      return;
    case 'todo':
      vscode.window.showInformationMessage(`Tami: "${a.label}" is not wired up yet.`);
      return;
    default:
      vscode.window.showWarningMessage(`Tami: unknown action type "${(a as Action).type}"`);
  }
}

/** macOS: add a Finder "Open with VS Code" Quick Action for folders, and make VS Code the default folder handler. Each step is skipped when already present or unavailable. */
export async function finderOpenWithCode(ctx: vscode.ExtensionContext): Promise<void> {
  if (process.platform !== 'darwin') { vscode.window.showWarningMessage('Tami: this option is macOS only.'); return; }
  const { execFileSync } = await import('child_process');
  const has = (cmd: string) => { try { execFileSync('/usr/bin/which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
  const done: string[] = [];
  let added = false;
  const dest = path.join(process.env.HOME ?? '', 'Library', 'Services', 'Open with VS Code.workflow');
  if (fs.existsSync(dest)) done.push('Quick Action already in Finder');
  else {
    fs.cpSync(path.join(ctx.extensionPath, 'media', 'open-with-vscode.workflow'), dest, { recursive: true });
    for (const a of ['-flush', '-update']) execFileSync('/System/Library/CoreServices/pbs', [a], { stdio: 'ignore' });
    added = true;
    done.push('Quick Action added (Finder > right-click folder > Quick Actions)');
  }
  if (has('duti')) { execFileSync('duti', ['-s', 'com.microsoft.VSCode', 'public.folder', 'all']); done.push('VS Code set as default folder app'); }
  else done.push('default folder app not set: run "brew install duti" and try again');
  const pick = await vscode.window.showInformationMessage(`Tami: ${done.join('; ')}.`, ...(added ? ['Restart Finder'] : []));
  if (pick === 'Restart Finder') execFileSync('/usr/bin/killall', ['Finder']);   // makes Finder pick up the new Quick Action
}
