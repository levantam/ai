---
name: orchestrating-agents
description: Split a task into dedicated roles and run each as a focused subagent, then verify and combine the results. Use when the user wants work separated across roles (e.g. one agent deep-dives and fixes, another prepares the open-source PR), asks to "spawn agents", "split this up", "use a team", "orchestrate", or when a task has independent parts that each deserve deep, uninterrupted focus. Proactively asks clarifying questions, decides what to split vs combine, writes self-contained briefs, gates on one plan approval, dispatches, verifies, and synthesizes.
---

# Orchestrating Agents

**Skill identity:** Prefix every text response with `[orchestrate]`.

Turn one task into a small team of focused agents: ask, split, brief, approve, dispatch, verify, combine.

<HARD-GATE>
Do NOT spawn any agent until the user approves the plan in [4. Plan Gate]. The only exception is read-only spike tools you run yourself (Glob, Grep, Read, Bash read commands) during [1. Intake].
</HARD-GATE>

**AskUserQuestion constraints:** max 4 questions/call, 2-4 options each, header max 12 chars, preview only on single-select.

## Entry Points

| Called from | Skip | Start at |
|-------------|------|----------|
| Fresh | Nothing | [1. Intake] |
| `/brainstorming` or `/clarify` | Questions already answered in the passed context summary | [2. Decompose] |

---

## Process

### [1. Intake] - Ask and spike in parallel

Every message that asks the user something also runs exploration tools in the same message. Never wait idle.

**Call 1** (with a broad spike: repo layout, README, CONTRIBUTING, configs, git status/log):
- **Goal** (multi): Fix/resolve / Build / Research / Prepare deliverable (PR, doc, ticket)
- **Done means** (multi): Tests pass / PR ready to open / Written findings / Code merged locally
- **Constraints** (multi): Time-boxed / Upstream conventions / No public actions / Minimal diff
- **Split** (single): You decide the roles / I'll define the roles / I'll name some, you fill the rest / No split, work solo

If the user picks "I'll define the roles" or "I'll name some", ask them to list each role as `name: what it should do` in free text (via the "Other" option or the next message). Treat user-defined roles as fixed: keep their names and boundaries, only add type, dependencies, briefs and the `verify` role. If they pick "No split", skip to solo work on the main thread.

**Call 2** (with a targeted spike based on Call 1): 1-3 task-specific questions built from spike findings. Stop asking once goal, done-criteria, constraints and deliverable are unambiguous.

Summarize the task in 2-3 lines before moving on.

### [2. Decompose] - Split, combine, or stay solo

**User-defined roles win.** If the user listed roles in [1. Intake], use them as given. Only flag a conflict (two `write` roles at once, missing context, overlap) and ask how to resolve it; never silently merge or drop a user role.

**Each selected Goal is a candidate role.** E.g. Research + Fix/resolve -> a `research` agent and a `write` agent running in parallel. Combine two goals into one role only when they need the same context, and say why in the plan.

**Solo check first** (only when the skill decides the roles). If the task needs fewer than ~10 tool calls, or every part needs the same full context, say so and do it on the main thread. Multi-agent runs cost ~15x the tokens of a chat; spawn only when focus or parallelism pays for it.

Otherwise define roles. Each role has exactly one type:

| Type | Does | Isolation | Concurrency |
|------|------|-----------|-------------|
| `research` | Reads, investigates, reports. No edits. | Shared tree | Parallel with anything |
| `write` | Edits code or files | `isolation: "worktree"` | One `write` agent at a time |
| `verify` | Checks other roles' output against their briefs; runs tests/lint | Shared tree or the writer's worktree | After the roles it checks |

Rules:
- **Split** when parts are independent, need different expertise, or would blow one context window.
- **Combine** when two roles would read mostly the same files or one's output is the other's whole input.
- **Keep on main thread**: final synthesis, user-facing decisions, anything public (push, PR open, comments).
- **Always include one `verify` role.**
- Default team size 1-3 workers + 1 verifier. Justify anything larger.
- Map dependencies: each role is either `parallel` or `after: <role>`.

### [3. Brief] - Write a self-contained prompt per role

Agents start cold. Never write "based on the conversation" or "as discussed". Every brief uses this structure:

```
Role: <name> (<type>)
Objective: <one sentence, the single outcome>
Background: <facts from intake and spike: paths, error text, versions, links>
In scope: <what to do>
Out of scope: <what not to touch or decide>
Tools and sources: <where to look, commands to run>
Files you may modify: <list, or "none">
Effort: <expected depth, e.g. "trace root cause before proposing a fix">
Output format: <exact sections to return>
Final line: STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED + one-line reason
```

`verify` briefs also include the other roles' briefs verbatim and the checks to run.

### [4. Plan Gate] - One approval

Show the plan as one table:

| Role | Type | Runs | Brief (1 line) |
|------|------|------|----------------|

Then ask:
- **Plan** (single): Approve / Edit roles (add, remove, split, merge, rename) / Cut to solo / Show full briefs

Loop until approved.

### [5. Dispatch]

- Launch all `parallel` roles in a single message with `run_in_background: true`.
- Launch the `write` role with `isolation: "worktree"`. A second `write` role waits until the first finishes.
- Launch `after:` roles only when their dependencies report.
- Use `subagent_type`: `Explore` for broad read-only search, `Plan` for design, `general-purpose` for everything else.
- While agents run, do not predict or fabricate their results. If the user asks, say what is still running.

Handle each report by status:

| Status | Action |
|--------|--------|
| DONE | Queue for verify |
| DONE_WITH_CONCERNS | Read concerns; ask the user if a decision is theirs, else queue for verify |
| NEEDS_CONTEXT | Answer from spike, or ask the user; continue the same agent via `SendMessage` |
| BLOCKED | Reframe the brief or escalate to the user; do not silently retry |

### [6. Verify & Combine]

- Run the `verify` role on finished outputs.
- Fix loop: send findings back to the original agent via `SendMessage`. Max 2 rounds, then report open issues to the user.
- Synthesize on the main thread:
  - **Outcome**: did each role meet its objective (yes/no + evidence)
  - **Changes**: worktree path/branch and diff summary
  - **Findings**: key facts with sources
  - **Open issues**: anything unverified or parked
  - **Next step**: one proposed action

Then ask:
- **Next** (single): Apply worktree changes / Draft PR or commit / Another round / Done

Public actions (push, open PR, post comments) need explicit user confirmation every time.

---

## Example

Task: "In valhalla upstream, fix bug X and prepare it as an open-source PR."

| Role | Type | Runs | Brief |
|------|------|------|-------|
| conventions | research | parallel | Read CONTRIBUTING, CHANGELOG format, CI config, recent merged PRs; return commit/PR rules |
| fixer | write | parallel | Reproduce X, trace root cause, minimal fix + test in worktree |
| verifier | verify | after: conventions, fixer | Build, run tests, lint; check diff against conventions report |

Main thread then drafts commit message and PR body from all three reports.

## Key Principles

- **Ask before splitting** - wrong decomposition wastes more than a question costs.
- **Fewer, deeper agents** - one focused agent with a rich brief beats three vague ones.
- **Self-contained briefs** - objective, boundaries, output format, status line.
- **One writer at a time** - in its own worktree.
- **Always verify** - no combined result without an independent check.
- **Evidence over claims** - every outcome line cites a test run, file, or source.
- **User owns decisions and public actions.**
