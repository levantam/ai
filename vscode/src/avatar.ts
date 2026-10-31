import * as vscode from 'vscode';
import { renderPage } from './page';

let panel: vscode.WebviewPanel | undefined;

export function currentAvatar() { return panel; }

/** (Re)render the avatar page, e.g. after the mascot setting changes. */
export function refreshAvatar(ctx: vscode.ExtensionContext) {
  if (!panel) return;
  const mode = vscode.workspace.getConfiguration('tami').get<'beside' | 'window'>('avatar.mode', 'beside');
  const tip = mode === 'window' ? 'this is its own window, drag it anywhere' : 'right-click the tab → "Move into New Window" to float over the screen';
  panel.webview.html = renderPage(panel.webview, ctx, 'avatar',
    `<div class="hint">The mascot fits the window, so resize the window to resize it · click to wave · ${tip}</div>`);
}

export async function openAvatar(ctx: vscode.ExtensionContext): Promise<void> {
  if (panel) { panel.reveal(); return; }
  panel = vscode.window.createWebviewPanel('tami.avatar', 'Tami', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'media')],
  });
  panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, 'media', 'icon.svg');
  const mode = vscode.workspace.getConfiguration('tami').get<'beside' | 'window'>('avatar.mode', 'beside');
  refreshAvatar(ctx);
  panel.onDidDispose(() => { panel = undefined; });

  // 'beside': lock the side group so files keep opening in the main editor (same layout as Claude Code / Copilot chat).
  // 'window': pop out into an OS window (VS Code ≥1.85). Both ignored on hosts without the command.
  // In window mode also pin it above every other app (macOS/Windows/Linux), so it behaves like a desktop pet.
  const cmds = mode === 'window'
    ? ['workbench.action.moveEditorToNewWindow', 'workbench.action.enableWindowAlwaysOnTop', 'workbench.action.enableCompactAuxiliaryWindow']
    : ['workbench.action.lockEditorGroup'];
  for (const c of cmds) { try { await vscode.commands.executeCommand(c); } catch { /* host lacks it: keep as plain tab */ } }
}
