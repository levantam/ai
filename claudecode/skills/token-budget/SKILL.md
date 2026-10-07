---
name: token-budget
description: >-
  Keeps context small during exploration and implementation. Use when searching
  a repo, reading files, running shell commands, handing off to subagents, or
  whenever output might flood the context window. Pairs with RTK (bash output)
  and path-scoped .claude/rules.
---

# Token Budget

**Skill identity:** Prefix every text response with `[budget]`.

Default caps for this session unless the user overrides:

| Limit | Default | Override example |
|-------|---------|------------------|
| Files opened with Read in one investigation pass | 8 | "deep dive: up to 20 files" |
| Lines per Read call | 200 | use offset/limit for the rest |
| Full file read | Only if file ≤ 150 lines or user asked | otherwise grep + partial read |
| Tool calls before a 5-line progress note | 6 | required note: found / next / blocked |
| User-facing summary of research | ≤ 40 lines | bullets + `path:line` refs |

## Search order (always)

1. **Locate** — Glob or `rg --files` with a tight glob; never `find .` or recursive `ls` on large trees.
2. **Narrow** — `rg` with pattern + path; prefer `-l` (paths only) before opening files.
3. **Read** — smallest slice that answers the question; one module at a time.
4. **Expand** — only after the progress note if still blocked.

Built-in Read/Grep/Glob are not RTK-hooked. For large content, use Bash with RTK (`rtk read`, `rtk grep`, `head`, `tail`, `rg`) or cap built-in Read with `limit`.

## Shell commands

- Prefer flags that shrink output: `git log -5 --oneline`, scoped `git diff`, test runners with fail-only habits.
- Never paste full build/test logs; extract failing test name, assertion, and ≤ 30 lines of traceback.
- Do not run exploratory commands "just in case" — each command needs a stated question.

## Writes and diffs

- Match **Ponytail** / minimal-diff norms when editing: smallest change that satisfies the task.
- Do not re-read entire files after a small edit unless verification failed.

## Subagents and handoffs

When spawning research or verify roles (see orchestrating-agents):

**Handoff out (to subagent)** — include only:

- Objective (one sentence)
- Paths / errors already known
- Caps: "read-only, ≤ N files, report ≤ 40 lines"

**Handoff back (to main thread)** — require:

- Answer / recommendation
- Evidence: `path:line` list
- Explicit "did not read" areas if budget stopped early

## When to stop and ask

Stop and ask the user if:

- The cap would block a fair solution and scope is unclear
- Two equally likely areas need more than the file budget
- Secrets or env files seem required to proceed

Do not silently blow the budget.
