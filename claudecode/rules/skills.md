# When to use which skill or plugin

| Situation | Use |
|-----------|-----|
| Large repo exploration, many files, big logs | **token-budget** (local) |
| New feature, behavior change, unclear design | **brainstorming** (local) — before coding |
| Independent parts, parallel research + write + verify | **orchestrating-agents** (local) |
| Architecture / plan / shareable diagram | **Archify** (`npx skills add tt-a1i/archify`) |
| Implementation style: minimal diff, senior-dev restraint | **Ponytail** (plugin) |
| Structured PR/branch review, precision over chat review | **Open Code Review** (`ocr` CLI + plugin) |

## Defaults

- Creative work: brainstorming → then implement with Ponytail + token-budget.
- Reviews: prefer `/open-code-review:review` over ad-hoc full-thread review.
- Do not load conflicting style skills for the same edit pass.

## Local source paths

Skills: `claudecode/skills/<name>/` → wired to `.claude/skills/<name>/`

Rules: `claudecode/rules/*.md` → wired to `.claude/rules/*.md`
