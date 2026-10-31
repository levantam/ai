import * as vscode from 'vscode';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { Action, Section } from './tools';

const KEY = 'custom.items';
const TEMPLATE = {
  _help: 'Edit "items", then upload this file in Tami > Custom commands > Upload. Each item runs a shell command in its own terminal. icon is a codicon name (optional).',
  items: [{ label: 'Example: list files', command: 'ls -la', terminal: 'Custom', icon: 'terminal', meta: '' }],
};

/** The user's uploaded commands as a sidebar section (always has the template/upload buttons). */
export function customSection(ctx: vscode.ExtensionContext): Section {
  const items: Action[] = ctx.globalState.get<Action[]>(KEY, []);
  return {
    title: 'Custom', guest: true,
    groups: [{
      id: 'custom', icon: 'add', title: 'Custom commands', open: true,
      items: [
        ...items,
        { icon: 'cloud-download', label: 'Download template', meta: 'JSON', type: 'vscode', command: 'tami.custom.template' },
        ...(items.length ? [{ icon: 'trash', label: 'Delete commands', meta: 'pick which', type: 'vscode' as const, command: 'tami.custom.delete' }] : []),
        { icon: 'cloud-upload', label: 'Upload commands', meta: items.length ? `${items.length} loaded` : 'JSON', type: 'vscode', command: 'tami.custom.upload' },
      ],
    }],
  };
}

export async function downloadTemplate() {
  const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`${process.env.HOME ?? ''}/tami-commands.json`), filters: { JSON: ['json'] } });
  if (!uri) return;
  fs.writeFileSync(uri.fsPath, JSON.stringify(TEMPLATE, null, 2));
  await vscode.commands.executeCommand('revealFileInOS', uri);   // opens the folder with the file selected
}

export async function uploadCommands(ctx: vscode.ExtensionContext, refresh: () => void) {
  const [uri] = (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { JSON: ['json'] } })) ?? [];
  if (!uri) return;
  try {
    const raw = JSON.parse(fs.readFileSync(uri.fsPath, 'utf8')).items;
    if (!Array.isArray(raw)) throw new Error('"items" must be a list');
    const items: Action[] = raw.map((r: any, i: number) => {
      const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      if (!s(r.label) || !s(r.command)) throw new Error(`item ${i + 1} needs a label and a command`);
      return { type: 'shell', label: s(r.label), command: s(r.command), terminal: s(r.terminal) || 'Custom', icon: /^[a-z-]+$/.test(s(r.icon)) ? s(r.icon) : 'terminal', meta: s(r.meta) || undefined };
    });
    const bad = (await Promise.all(items.map(async (a) => [a.label, await problem(a.command!)] as const))).filter(([, why]) => why);
    if (bad.length) throw new Error(bad.map(([l, why]) => `${l}: ${why}`).join('; '));
    await ctx.globalState.update(KEY, items);
    refresh();
    vscode.window.showInformationMessage(`Tami: ${items.length} custom command(s) loaded.`);
  } catch (e) {
    vscode.window.showErrorMessage(`Tami: cannot load commands (${(e as Error).message})`);
  }
}

export async function deleteCommands(ctx: vscode.ExtensionContext, refresh: () => void) {
  const items = ctx.globalState.get<Action[]>(KEY, []);
  const picked = await vscode.window.showQuickPick(items.map((a) => ({ label: a.label, description: a.command })), { canPickMany: true, placeHolder: 'Select commands to delete' });
  if (!picked?.length) return;
  const gone = new Set(picked.map((p) => p.label));
  await ctx.globalState.update(KEY, items.filter((a) => !gone.has(a.label)));
  refresh();
}

/** Why a command cannot run, or '' if it looks fine: the shell parses it and its first program, alias or function exists. */
const sh = (args: string[]) => new Promise<boolean>((resolve) => execFile('/bin/zsh', args, { timeout: 5000 }, (e) => resolve(!e)));
async function problem(command: string): Promise<string> {
  if (!(await sh(['-n', '-c', command]))) return 'syntax error';
  const first = command.split(/\s+/).find((w) => w && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));   // skip VAR=value prefixes
  if (!first) return 'no command';
  const word = first.replace(/^["']|["']$/g, '');
  // interactive shell, like the terminal, so aliases, nvm and PATH from ~/.zshrc count
  return (await sh(['-ic', 'whence -- "$1" >/dev/null', 'x', word])) ? '' : `"${word}" not found`;
}
