
# Claude Code

Set up this repo for [Claude Code](https://code.claude.com/docs/en/overview). Run Claude Code from the **repository root** (`levantam-ai`).

**Command cheat sheet (by library):** [README.md](./README.md)

## One-shot setup prompt

Copy the entire block below and paste it as **one message** in Claude Code (new session, cwd = repo root).

```text
You are setting up Claude Code for the levantam-ai workspace. Do everything below in order. Ask me only if a step fails or needs a secret (API keys). When finished, print a short checklist of what was installed and how to verify each piece.

## Goals
- Project memory: CLAUDE.md + .claude/settings.json
- Local skills from ./claudecode/skills/ available as project skills
- Integrations from these upstream projects (install + verify):
  - Archify (diagrams): https://github.com/tt-a1i/archify
  - RTK (compact bash output): https://github.com/rtk-ai/rtk
  - Ponytail (minimal-diff coding style): https://github.com/dietrichgebert/ponytail
  - Open Code Review (structured reviews): https://github.com/alibaba/open-code-review
  - CodeGraph (local code knowledge graph via MCP): https://github.com/colbymchenry/codegraph

## 0. Preflight
- Confirm cwd is the git root (getting-started.md and claudecode/ exist).
- Run: git status; node -v; npm -v; which claude || true; which brew || true
- If CLAUDE.md is missing or thin, run /init (or CLAUDE_CODE_NEW_INIT=1 /init) and merge results — do not wipe existing intentional content in getting-started.md.

## 1. Project layout (.claude + CLAUDE.md)
Create or update:

1. **CLAUDE.md** (keep under ~150 lines) with:
   - Purpose: personal AI tooling workspace (Claude Code skills + references)
   - Always run from repo root so .claude/skills load
   - Pointers: getting-started.md (setup), claudecode/skills/ (source of truth for custom skills)
   - Conventions: minimal diffs, match existing skill style, no secrets in git
   - When to use which skill: token-budget during exploration; brainstorming before creative work; orchestrating-agents for multi-role tasks; archify for diagrams; ponytail during implementation; open-code-review for reviews

2. **.claude/settings.json** — sensible defaults:
   - Enable project skills
   - Do not disable hooks if RTK installs them globally (RTK uses user-level hooks via rtk init -g)

3. **.claude/skills/** — for each folder under claudecode/skills/ (brainstorming, orchestrating-agents, token-budget):
   - Prefer symlink if OS allows: .claude/skills/<name> -> ../../claudecode/skills/<name>
   - Else copy SKILL.md and any referenced files (e.g. brainstorming/process-flow.md)
   - Preserve YAML frontmatter (name, description)

4. **.claude/rules/** — wire from claudecode/rules/ (same symlink-or-copy approach as skills):
   - `search-strategy.md` — Glob/rg before Read; line limits; RTK for large bash output
   - `skills.md` — when to invoke local vs plugin skills

## 1b. Token discipline (local skill + rules)
- Wire **token-budget** from claudecode/skills/token-budget/ like other local skills
- Wire **claudecode/rules/** → `.claude/rules/`
- In CLAUDE.md, add one line: "Apply token-budget caps during repo exploration unless I say deep dive"
- Keep CLAUDE.md under ~150 lines; move long reference into skills/rules

## 2. RTK (shell output compression) — CLI + global hook
RTK is not a Claude plugin; it hooks Bash tool calls after global init.

- Install RTK (macOS): brew install rtk  OR  use official install script/binary from rtk-ai/rtk README if brew unavailable
- Run: rtk --version
- Run: rtk init -g   (Claude Code default; installs hook + RTK.md)
- If non-interactive needed: rtk init -g --auto-patch
- Tell me to restart Claude Code after hook install
- Verify: rtk init --show
- Note in CLAUDE.md: built-in Read/Grep/Glob are not hooked; prefer shell or explicit rtk read/grep/find when output is huge

## 3. Archify (interactive diagrams skill)
- Install skill (project-local preferred for this repo):
  npx skills add tt-a1i/archify
  If that CLI targets a different agent path, also install globally:
  npx skills add tt-a1i/archify -g
- Verify skill appears in Claude Code (/help or skills list)
- Smoke test prompt (do not save artifact unless I ask): "Use Archify to diagram: Browser -> API -> Redis -> PostgreSQL on cache miss"

## 4. Ponytail (plugin marketplace)
Inside Claude Code, run exactly:
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail

Verify slash commands / ponytail namespace skills load per ponytail README.

## 5. Open Code Review (CLI + plugin)
Requires Git >= 2.41 and a configured LLM for ocr (unless using delegate mode only).

- Shell: npm install -g @alibaba-group/open-code-review
- Verify: ocr --version  (or ocr --help)
- Inside Claude Code:
  /plugin marketplace add alibaba/open-code-review
  /plugin install open-code-review@open-code-review
- Document for me (do not run interactive config unless I am present):
  ocr config provider
  ocr config model
  ocr llm test
- Verify plugin exposes /open-code-review:review (and delegate-review if documented)

## 6. CodeGraph (code knowledge graph, MCP)
Local SQLite graph of symbols/call edges so Claude explores code in one call instead of grep/read crawling. No API keys.

- Install: npm i -g @colbymchenry/codegraph  (or: curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh)
- Verify: codegraph --help  (open a new terminal if not on PATH)
- Run: codegraph install   (auto-configures Claude Code MCP; does not index)
- From repo root run: codegraph init   (creates .codegraph/ and builds the graph; auto-syncs after)
- Verify: codegraph status
- Tell me to restart Claude Code; then check the `codegraph` MCP server in /mcp
- Optional: add "mcp__codegraph__*" to permissions.allow in ~/.claude/settings.json

## 7. Git hygiene
- Ensure .gitignore covers: .env, ocr local secrets, .codegraph/, OS junk
- Do not commit API keys or ocr credentials
- Stage only setup artifacts: CLAUDE.md, .claude/**, .gitignore updates — show me git diff before commit (do not commit unless I say)

## 8. Final report
Return markdown with:
| Component | Status | Verify command / action |
| Archify | ... | ... |
| RTK | ... | restart Claude + git status |
| Ponytail | ... | ... |
| Open Code Review | ... | ocr + slash command |
| CodeGraph | ... | codegraph status + /mcp |
| Local skills | ... | /brainstorming, /token-budget, orchestrating-agents |
| Token rules | ... | .claude/rules/search-strategy.md present |
| CLAUDE.md | ... | ... |

List anything that requires my manual step (API keys, Claude restart, marketplace auth).
```

## Reference — upstream repos

| Project | Role | Install hint |
|--------|------|----------------|
| [archify](https://github.com/tt-a1i/archify) | Interactive architecture / plan diagrams | `npx skills add tt-a1i/archify` |
| [rtk](https://github.com/rtk-ai/rtk) | Compress Bash output (~token savings) | `brew install rtk` then `rtk init -g` |
| [ponytail](https://github.com/dietrichgebert/ponytail) | Minimal, senior-dev coding discipline | Claude Code plugin marketplace |
| [open-code-review](https://github.com/alibaba/open-code-review) | Precision code review CLI + slash commands | `npm i -g @alibaba-group/open-code-review` + plugin |
| [codegraph](https://github.com/colbymchenry/codegraph) | Local code knowledge graph (MCP) for cheaper exploration | `npm i -g @colbymchenry/codegraph`, `codegraph install`, `codegraph init` |

Docs: [Claude Code CLAUDE.md](https://code.claude.com/docs/en/claude-md) · [Skills](https://code.claude.com/docs/en/skills) · [Plugins](https://code.claude.com/docs/en/plugins)

## Local skills (source of truth)

Custom skills live under `claudecode/skills/` and should be wired into `.claude/skills/` (symlink or copy):

- `claudecode/skills/brainstorming/` — design before implementation
- `claudecode/skills/orchestrating-agents/` — split work across focused subagents
- `claudecode/skills/token-budget/` — caps for search/read/shell and subagent handoffs

Rules templates (wire to `.claude/rules/`):

- `claudecode/rules/search-strategy.md` — exploration order and RTK notes
- `claudecode/rules/skills.md` — local vs plugin skill routing

After setup, restart Claude Code (required for RTK hooks and new plugins).
