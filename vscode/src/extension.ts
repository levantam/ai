import * as vscode from 'vscode';
import { deleteCommands, downloadTemplate, uploadCommands } from './custom';
import { SidebarProvider } from './sidebar';
import { currentAvatar, openAvatar, refreshAvatar } from './avatar';
import * as git from './git';
import { finderOpenWithCode } from './tools';
import { animateEnabled, currentMascot, mascots, nextMascot } from './page';

const AUTHOR_TELEGRAM = '@tamvle';
let sidebar: SidebarProvider;
let autoTimer: NodeJS.Timeout | undefined;

export function activate(ctx: vscode.ExtensionContext) {
  sidebar = new SidebarProvider(ctx);
  scheduleMascot(ctx);
  sidebar.syncAdmin(true);
  const adminWatch = setInterval(() => sidebar.syncAdmin(), 4000); adminWatch.unref?.();     // a sign-in or sign-out in another window shows here too
  ctx.subscriptions.push({ dispose: () => clearInterval(adminWatch) });
  ctx.subscriptions.push({ dispose: () => autoTimer && clearInterval(autoTimer) });
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider('tami.sidebar', sidebar, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('tami.openAvatar', () => openAvatar(ctx)),
    ...([['commitPush', git.commitPush], ['newBranch', git.newBranch], ['deleteBranches', git.deleteBranches], ['mergeRequest', git.createMergeRequest]] as const).map(([id, fn]) =>
      vscode.commands.registerCommand(`tami.git.${id}`, () => fn().catch((e: Error) => vscode.window.showErrorMessage(`Tami git: ${e.message}`)))),
    vscode.commands.registerCommand('tami.custom.template', () => downloadTemplate()),
    vscode.commands.registerCommand('tami.custom.delete', () => deleteCommands(ctx, () => sidebar.render())),
    vscode.commands.registerCommand('tami.custom.upload', () => uploadCommands(ctx, () => sidebar.render())),
    vscode.commands.registerCommand('tami.finderOpenWithCode', () => finderOpenWithCode(ctx)),
    vscode.commands.registerCommand('tami.checkin', () => sidebar.checkin()),
    vscode.commands.registerCommand('tami.about', async () => {
      const pick = await vscode.window.showInformationMessage(`Tami ${ctx.extension.packageJSON.version}`, { modal: true, detail: `Author: Telegram ${AUTHOR_TELEGRAM}` }, 'Copy username');
      if (pick === 'Copy username') await vscode.env.clipboard.writeText(AUTHOR_TELEGRAM);
    }),
    vscode.commands.registerCommand('tami.chooseQuickActions', () => sidebar.pickQuick()),
    vscode.commands.registerCommand('tami.toggleSections', () => sidebar.toggleSections()),
    vscode.commands.registerCommand('tami.customize', () => sidebar.toggleEdit()),
    vscode.commands.registerCommand('tami.admin', () => sidebar.adminToggle()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('tami.avatar.animate')) broadcast({ type: 'animate', value: animateEnabled() });
      if (e.affectsConfiguration('tami.ai') || e.affectsConfiguration('tami.attendance') || e.affectsConfiguration('tami.timeTheme') || e.affectsConfiguration('tami.workingCode') || e.affectsConfiguration('tami.showSpeech')) sidebar.render();
      if (e.affectsConfiguration('tami.mascotAuto') || e.affectsConfiguration('tami.mascotAutoMinutes')) scheduleMascot(ctx);
      if (e.affectsConfiguration('tami.mascot')) { sidebar.render(); refreshAvatar(ctx); }
    }),
  );
}

/** Random mascot every N minutes while tami.mascotAuto is on. Writes tami.mascot, which re-renders everything. */
function scheduleMascot(ctx: vscode.ExtensionContext) {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = undefined;
  const cfg = vscode.workspace.getConfiguration('tami');
  if (!cfg.get<boolean>('mascotAuto', false)) return;
  const ms = Math.max(1, cfg.get<number>('mascotAutoMinutes', 15)) * 60_000;
  autoTimer = setInterval(() => {
    const next = nextMascot(Object.keys(mascots(ctx)), currentMascot(ctx)[0]);
    vscode.workspace.getConfiguration('tami').update('mascot', next, vscode.ConfigurationTarget.Global);
  }, ms);
}

function broadcast(msg: unknown) {
  sidebar?.view?.webview.postMessage(msg);
  currentAvatar()?.webview.postMessage(msg);
}

export function deactivate() {}
