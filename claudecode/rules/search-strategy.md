# Search and read strategy

Apply on every task unless the user explicitly requests a deep dive.

## Order

1. **Glob or ripgrep file list** — tight glob, no repo-wide `find` / `ls -R`.
2. **rg with path + pattern** — use `-l` for paths only when possible.
3. **Read with limit** — default ≤ 200 lines; use offset for the rest.
4. **Expand scope** — only after a short note: what you found, what you need next.

## RTK

Bash output is compressed when RTK hooks are installed (`rtk init -g`). Built-in Read, Grep, and Glob are not hooked.

Prefer for large output:

- `rg`, `head`, `tail` via Bash (RTK-aware)
- or `rtk read` / `rtk grep` when available

## Shell

- Scoped git: `git log -10 --oneline`, narrow `git diff` paths
- Tests: failures and names first; no full green test logs
- Logs: last N lines or `rg` for ERROR/FAIL

## Stop and ask

Ask before exceeding **token-budget** file/read caps or reading likely secrets (`.env`, credentials).
