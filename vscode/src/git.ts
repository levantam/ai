import * as vscode from 'vscode';
import { execFile } from 'child_process';

/** Git helpers for the sidebar: dialogs ask, git runs. Reads use execFile (no shell); writes run in a visible terminal. */

const conf = () => vscode.workspace.getConfiguration('tami.git');

/** The setting wins; otherwise origin's default branch, then main, then master, whichever exists. */
export async function baseBranch(cwd: string): Promise<string> {
  const set = (conf().get<string>('baseBranch', '') || '').trim();
  if (set) return set;
  const head = await git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).catch(() => '');
  if (head.startsWith('origin/')) return head.slice(7);
  for (const b of ['main', 'master']) if (await ok(git(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])) || await ok(git(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`]))) return b;
  return 'main';
}

/** POSIX single-quote, so a commit message or branch can hold quotes, $ and spaces without being interpreted. */
export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** "Fix login bug" -> fix-login-bug. A single word like feature/abc-123 is used as typed. */
export function branchName(input: string): string {
  const t = input.trim();
  const plain = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd');   // Vietnamese: "Sửa lỗi đăng nhập" -> sua-loi-dang-nhap
  return /\s/.test(t) ? plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : t;
}
export function branchError(name: string): string | undefined {
  if (!name) return 'Enter a branch name or a ticket title.';
  if (/(^[-./])|([./]$)|(\.\.)|(@\{)|(\/\/)|(\.lock$)|[\s~^:?*\[\\\x00-\x1f\x7f]/.test(name)) return 'That is not a valid git branch name.';
}

export type Provider = 'github' | 'gitlab' | 'bitbucket';
export function parseRemote(url: string): { host: string; path: string } | undefined {
  const scp = /^[\w.-]+@([^:/]+):(.+?)(?:\.git)?\/?$/.exec(url.trim());           // git@host:group/repo.git
  if (scp) return { host: scp[1], path: scp[2] };
  try { const u = new URL(url.trim()); return { host: /^https?:$/.test(u.protocol) ? u.host : u.hostname, path: u.pathname.replace(/^\/|\.git\/?$|\/$/g, '') }; } catch { return undefined; }
}
export function providerFor(host: string, forced = 'auto'): Provider {
  if (forced === 'github' || forced === 'gitlab' || forced === 'bitbucket') return forced;
  return /github/i.test(host) ? 'github' : /bitbucket/i.test(host) ? 'bitbucket' : 'gitlab'; // unknown self-hosted hosts are usually GitLab
}
export function mrUrl(p: Provider, host: string, path: string, source: string, target: string, title: string): string {
  const e = encodeURIComponent, seg = (b: string) => b.split('/').map(e).join('/');   // keeps "/" in feature/x, escapes # ? &
  if (p === 'github') return `https://${host}/${path}/compare/${seg(target)}...${seg(source)}?expand=1&title=${e(title)}`;
  if (p === 'bitbucket') return `https://${host}/${path}/pull-requests/new?source=${e(source)}&dest=${e(target)}&title=${e(title)}`;
  return `https://${host}/${path}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${e(source)}&merge_request%5Btarget_branch%5D=${e(target)}&merge_request%5Btitle%5D=${e(title)}`;
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile('git', args, { cwd, timeout: 20_000, maxBuffer: 4 << 20 }, (err, out, errOut) => (err ? reject(new Error((errOut || err.message).trim())) : resolve(out.trim()))));
}
const ok = (p: Promise<unknown>) => p.then(() => true, () => false);
const info = (m: string) => vscode.window.showInformationMessage(`Tami: ${m}`);
const warn = (m: string, ...b: string[]) => vscode.window.showWarningMessage(`Tami: ${m}`, ...b);

function folder(): string | undefined {
  const doc = vscode.window.activeTextEditor?.document.uri;
  return ((doc && vscode.workspace.getWorkspaceFolder(doc)) ?? vscode.workspace.workspaceFolders?.[0])?.uri.fsPath;
}
async function repo(): Promise<{ cwd: string; branch: string } | undefined> {
  const dir = folder();
  if (!dir) { warn('open a folder first.'); return; }
  try {
    const cwd = await git(dir, ['rev-parse', '--show-toplevel']);
    return { cwd, branch: await git(cwd, ['branch', '--show-current']).catch(() => '') };
  } catch { warn('this folder is not a git repository.'); }
}
function run(cwd: string, command: string) {
  const t = vscode.window.terminals.find((x) => x.name === 'Git') ?? vscode.window.createTerminal({ name: 'Git', cwd });
  t.show(true);
  t.sendText(`cd ${q(cwd)} && ${command}`);
}

/** Option 1: ask for the message, then add, commit and push. */
export async function commitPush() {
  const r = await repo(); if (!r) return;
  const msg = await vscode.window.showInputBox({
    title: `Commit and push${r.branch ? ' on ' + r.branch : ''}`, prompt: 'Commit message. This stages all changes, commits, then pushes.',
    placeHolder: 'Describe the change', ignoreFocusOut: true, validateInput: (v) => (v.trim() ? undefined : 'A commit message is required.'),
  });
  if (!msg) return;
  const sign = conf().get<boolean>('signCommits', false) ? '-S' : '--no-gpg-sign';
  const upstream = await ok(git(r.cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']));
  run(r.cwd, `git add . && git commit ${sign} -m ${q(msg.trim())} && ${upstream ? 'git push' : 'git push -u origin HEAD'}`);
}

/** Option 2: ask for a branch name or ticket title, then update the base branch and branch off it. */
export async function newBranch() {
  const r = await repo(); if (!r) return;
  const base = await baseBranch(r.cwd);
  const input = await vscode.window.showInputBox({
    title: `New branch from ${base}`, prompt: 'Branch name or ticket title. A title such as "Fix login bug" becomes fix-login-bug.',
    placeHolder: 'feature/abc-123 or Fix login bug', ignoreFocusOut: true,
    validateInput: (v) => {
      if (!v.trim()) return 'Enter a branch name or a ticket title.';
      const n = branchName(v), e = branchError(n);
      return e ?? (/\s/.test(v.trim()) ? { message: `Branch name: ${n}`, severity: vscode.InputBoxValidationSeverity.Info } : undefined);
    },
  });
  if (!input) return;
  const name = branchName(input);
  if (!(await ok(git(r.cwd, ['check-ref-format', '--branch', name])))) { warn(`"${name}" is not a valid branch name.`); return; }
  run(r.cwd, `git checkout ${q(base)} && git pull --ff-only && git checkout -b ${q(name)}`);
}

/** Option 3: pick local branches in a list (merged ones first), confirm, force-delete. */
export async function deleteBranches() {
  const r = await repo(); if (!r) return;
  const base = await baseBranch(r.cwd);
  const rows = (await git(r.cwd, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(committerdate:relative)%09%(subject)', 'refs/heads']))
    .split('\n').filter(Boolean).map((l) => l.split('\t'));
  const merged = new Set((await git(r.cwd, ['branch', '--merged', base, '--format=%(refname:short)']).catch(() => '')).split('\n').filter(Boolean));
  const items = rows.filter(([n]) => n !== r.branch && n !== base)   // never offer the current or the base branch
    .map(([n, when, subj]) => ({ label: n, description: when, detail: `${merged.has(n) ? `Merged into ${base}. ` : ''}${subj ?? ''}`, merged: merged.has(n) }))
    .sort((a, b) => Number(b.merged) - Number(a.merged));
  if (!items.length) { info('there are no other local branches to delete.'); return; }
  const picked = await vscode.window.showQuickPick(items, { canPickMany: true, matchOnDetail: true, title: `Delete local branches (current: ${r.branch || 'detached HEAD'})`, placeHolder: 'Tick the branches to delete' });
  if (!picked?.length) return;
  const names = picked.map((p) => p.label);
  const yes = await vscode.window.showWarningMessage(`Force delete ${names.length} branch${names.length === 1 ? '' : 'es'}?`,
    { modal: true, detail: `${names.join('\n')}\n\nThis uses git branch -D, so commits that are not merged anywhere are lost.` }, 'Delete');
  if (yes !== 'Delete') return;
  try { await git(r.cwd, ['branch', '-D', ...names]); info(`deleted ${names.join(', ')}.`); } catch (e) { vscode.window.showErrorMessage(`Tami: ${(e as Error).message}`); }
}

/** Option 4: open a merge request from the current branch into the base branch, with the title filled in. */
export async function createMergeRequest() {
  const r = await repo(); if (!r) return;
  const target = await baseBranch(r.cwd);
  if (!r.branch) { warn('you are not on a branch. Check one out first.'); return; }
  if (r.branch === target) { info(`you are on ${target}. Switch to a feature branch to open a merge request into it.`); return; }
  const remote = await git(r.cwd, ['remote', 'get-url', 'origin']).catch(() => '');
  const parsed = remote && parseRemote(remote);
  if (!parsed) { warn('this repository has no "origin" remote to open a merge request on.'); return; }
  const provider = providerFor(parsed.host, conf().get<string>('provider', 'auto'));
  const word = provider === 'gitlab' ? 'merge request' : 'pull request';

  if (!(await ok(git(r.cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${r.branch}`])))) {
    const pick = await warn(`"${r.branch}" is not on the remote yet. Push it, then run this again.`, 'Push branch');
    if (pick) run(r.cwd, `git push -u origin ${q(r.branch)}`);
    return;
  }
  const against = (await ok(git(r.cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${target}`]))) ? `origin/${target}` : target;
  const ahead = Number(await git(r.cwd, ['rev-list', '--count', `${against}..HEAD`]).catch(() => '0'));
  if (!ahead) { info(`"${r.branch}" has no new commits compared to ${target}, so there is nothing to merge.`); return; }
  const unpushed = Number(await git(r.cwd, ['rev-list', '--count', `origin/${r.branch}..HEAD`]).catch(() => '0'));
  if (unpushed) {
    const pick = await warn(`${unpushed} commit${unpushed === 1 ? '' : 's'} on "${r.branch}" ${unpushed === 1 ? 'is' : 'are'} not pushed, so the ${word} will not include ${unpushed === 1 ? 'it' : 'them'}.`, 'Push first', 'Open anyway');
    if (pick === 'Push first') { run(r.cwd, 'git push'); return; }
    if (pick !== 'Open anyway') return;
  }
  const title = await vscode.window.showInputBox({
    title: `New ${word}: ${r.branch} into ${target}`, prompt: `${word[0].toUpperCase()}${word.slice(1)} title`, ignoreFocusOut: true,
    value: await git(r.cwd, ['log', '-1', '--format=%s']).catch(() => r.branch), validateInput: (v) => (v.trim() ? undefined : 'A title is required.'),
  });
  if (!title) return;
  await vscode.env.openExternal(vscode.Uri.parse(mrUrl(provider, parsed.host, parsed.path, r.branch, target, title.trim())));
}
