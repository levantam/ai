# levantam-ai

Personal AI tooling workspace: Claude Code skills, rules, and references for integrations (Archify, RTK, Ponytail, Open Code Review).

## Working here

- Always run Claude Code from the repo root so `.claude/skills/` and `.claude/rules/` load.
- Setup: `getting-started.md` (one-shot prompt). Command cheat sheet: `README.md`.
- Source of truth for custom skills: `claudecode/skills/<name>/` (symlinked into `.claude/skills/`).
- Source of truth for rules: `claudecode/rules/*.md` (symlinked into `.claude/rules/`).
- Edit the `claudecode/` originals, never the symlinks' targets via a copy.

## Conventions

- Minimal diffs; match the existing skill style (YAML frontmatter `name` + `description`, "Skill identity" line, tables for caps/routing).
- Keep this file under ~150 lines; move long reference material into skills or rules.
- No secrets in git (`.env`, `ocr` provider credentials, API keys).

## Which skill when

- **token-budget** — during repo exploration. Apply token-budget caps during repo exploration unless I say deep dive.
- **brainstorming** — before any creative work (new feature, behavior change).
- **orchestrating-agents** — multi-role tasks with independent parts.
- **archify** — architecture / plan diagrams.
- **ponytail** — during implementation (minimal-diff discipline).
- **open-code-review** — structured reviews (`ocr` CLI + `/open-code-review:review`).

## RTK note

RTK compresses Bash tool output via a user-level hook (`rtk init -g`). Built-in Read/Grep/Glob are not hooked — when output may be huge, prefer `rg`/`head` via Bash or explicit `rtk read` / `rtk grep` / `rtk find`.
