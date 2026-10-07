# levantam-ai

Personal **Claude Code** tooling workspace: local skills, rules, and integrations (Archify, RTK, Ponytail, Open Code Review).

**First-time setup:** see [getting-started.md](./getting-started.md) (one-shot prompt).

Run Claude Code from this **repository root** so `.claude/skills` and rules load correctly.

---

## Claude Code (core)

| Command / action | What it does |
|------------------|--------------|
| `/init` | Generate or refresh `CLAUDE.md` from the codebase (merge, don’t overwrite custom docs). |
| `/plugin marketplace add <owner/repo>` | Register a plugin marketplace (GitHub repo). |
| `/plugin install <name>@<marketplace>` | Install and enable a plugin from a marketplace. |
| `/plugin` | List, enable, or disable installed plugins. |
| `/help` | Built-in and project skills/commands reference. |
| `/clear` | New session context (use between unrelated tasks to save tokens). |
| `/reload-plugins` | Reload plugins after changing `.claude/skills` plugin dirs. |

**Project paths (after setup)**

| Path | What it does |
|------|--------------|
| `CLAUDE.md` | Always-on project instructions (keep short). |
| `.claude/skills/` | Project skills (slash commands); wired from `claudecode/skills/`. |
| `.claude/rules/` | Modular rules; wired from `claudecode/rules/`. |
| `.claude/settings.json` | Project settings and permissions. |

---

## RTK — [rtk-ai/rtk](https://github.com/rtk-ai/rtk)

Compresses **Bash tool output** before it enters the model context. Install hook once globally; restart Claude Code.

| Command | What it does |
|---------|--------------|
| `brew install rtk` | Install RTK on macOS (see upstream README for other OS). |
| `rtk --version` | Check install. |
| `rtk init -g` | Install Claude Code hook + `RTK.md` (recommended). |
| `rtk init -g --auto-patch` | Same, non-interactive (CI/scripts). |
| `rtk init -g --hook-only` | Hook only, no `RTK.md`. |
| `rtk init --show` | Verify hook installation. |

| Behavior | What it does |
|----------|--------------|
| Auto-rewrite | e.g. `git status` → `rtk git status` on Bash tool calls. |
| Not hooked | Built-in **Read**, **Grep**, **Glob** — use `rg`/`head` or `rtk read`/`rtk grep` for large output. |

---

## Archify — [tt-a1i/archify](https://github.com/tt-a1i/archify)

Turns descriptions (or repo structure) into **interactive HTML diagrams**.

| Command | What it does |
|---------|--------------|
| `npx skills add tt-a1i/archify` | Add Archify skill to this project. |
| `npx skills add tt-a1i/archify -g` | Add globally (all projects). |

| In Claude Code (examples) | What it does |
|-----------------------------|--------------|
| *Natural language:* “Use Archify to diagram …” | Creates/refines an interactive diagram from your description. |
| Follow-ups: “Add auth”, “Highlight cache miss”, “Light theme” | Iterates on the same diagram artifact. |

---

## Ponytail — [DietrichGebert/ponytail](https://github.com/dietrichgebert/ponytail)

Minimal-diff coding discipline (plugin). Install marketplace once, then plugin.

| Command | What it does |
|---------|--------------|
| `/plugin marketplace add DietrichGebert/ponytail` | Add Ponytail marketplace. |
| `/plugin install ponytail@ponytail` | Install Ponytail plugin. |

| Slash command | What it does |
|---------------|--------------|
| `/ponytail [lite \| full \| ultra \| off]` | Set intensity or toggle on/off. |
| `/ponytail-review` | Review current diff for over-engineering; optional target (`uncommitted`, `staged`, `branch`, PR URL). |
| `/ponytail-audit` | Repo-wide over-engineering audit (not just diff). |
| `/ponytail-debt` | Collect deferred `ponytail:` shortcuts into a ledger. |
| `/ponytail-gain` | Show benchmark-style impact summary. |
| `/ponytail-help` | Command cheat sheet. |

---

## Open Code Review — [alibaba/open-code-review](https://github.com/alibaba/open-code-review)

Structured code review via **`ocr` CLI** + Claude Code plugin. Requires **Git ≥ 2.41** and LLM config (unless delegate-only).

### Install & plugins

| Command | What it does |
|---------|--------------|
| `npm install -g @alibaba-group/open-code-review` | Install `ocr` CLI globally. |
| `ocr --help` | Verify CLI. |
| `/plugin marketplace add alibaba/open-code-review` | Add OCR marketplace. |
| `/plugin install open-code-review@open-code-review` | Install review slash commands. |

### Configure LLM (shell, interactive)

| Command | What it does |
|---------|--------------|
| `ocr config provider` | Choose or add LLM provider. |
| `ocr config model` | Set model for active provider. |
| `ocr llm test` | Smoke-test LLM connection. |

### Review (CLI)

| Command | What it does |
|---------|--------------|
| `ocr review` | Review current changes (default scope). |
| `ocr review --from main --to feature-branch` | Review branch range. |
| `ocr review --commit abc123` | Review a single commit. |
| `ocr review --from main --to feature-branch --resume <session-id>` | Resume a review session. |
| `ocr scan` | Full-file review (no meaningful diff). |
| `ocr scan --path internal/agent` | Scan directory or files. |
| `ocr scan --resume <session-id>` | Resume scan session. |
| `ocr session list` | List saved sessions. |
| `ocr review --format json --output result.json` | Export structured results. |
| `ocr delegate preview` | Preview delegation to host model. |
| `ocr delegate rule <files...>` | Delegate rules for specific files. |

### Review (Claude Code plugin)

| Slash command | What it does |
|---------------|--------------|
| `/open-code-review:review` | Run OCR-backed review on current changes. |
| `/open-code-review:delegate-review` | Review using delegation mode (host model). |

---

## Local skills — `claudecode/skills/`

Wire into `.claude/skills/<name>/` (symlink or copy). Invoke with `/skill-name` or let Claude load when relevant.

| Skill | Invoke | What it does |
|-------|--------|--------------|
| **token-budget** | `/token-budget` | Caps search/read/shell volume; handoff format for subagents. |
| **brainstorming** | `/brainstorming` | Design and spec **before** any implementation. |
| **orchestrating-agents** | `/orchestrating-agents` | Split work into roles, brief, verify, synthesize. |

---

## Local rules — `claudecode/rules/`

Wire into `.claude/rules/` (loaded automatically; path-scoped rules optional later).

| File | What it does |
|------|--------------|
| `search-strategy.md` | Glob/`rg` before Read; RTK notes; small shell/git habits. |
| `skills.md` | When to use local skills vs Archify / Ponytail / OCR. |

---

## Quick “what do I use when?”

| I want to… | Use |
|------------|-----|
| Set up everything once | [getting-started.md](./getting-started.md) one-shot prompt |
| Explore a big repo cheaply | **token-budget** + RTK + `search-strategy` rule |
| Plan a feature | **brainstorming** |
| Parallel research + fix + verify | **orchestrating-agents** |
| Draw architecture | **Archify** (natural language) |
| Keep diffs tiny while coding | **Ponytail** |
| Review a branch/PR seriously | **ocr** + `/open-code-review:review` |
| Remember commands | This README |
