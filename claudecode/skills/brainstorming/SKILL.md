---
name: brainstorming
description: >-
  Collaborative brainstorming that turns ideas into designs and specs before any
  code is written. MUST be used before any creative work — creating features,
  building components, adding functionality, or modifying behavior. Explores
  user intent, requirements, and design through structured dialogue. Use when
  the user wants to brainstorm, design, plan a feature, explore ideas, or
  before starting any new creative implementation.
---

# Brainstorming Ideas Into Designs

**Skill identity:** Prefix every text response with `🧠 [brainstorm]` so the user always knows which skill is active.

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by collecting context, spiking the project to discover existing resources, asking clarifying questions, then deciding whether the task needs design proposals or can proceed directly to the convergence gate.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have completed the brainstorming process. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

**AskUserQuestion constraints:** max 4 questions/call · 2–4 options each · header ≤12 chars · preview only on single-select.

## Entry Points

| Called from | Skip | Start at |
|-------------|------|----------|
| Fresh | Nothing | [0. Context] |
| `/clarify` | [0. Context], [2. Clarify] — use passed context summary | [1. Spike] |

When invoked from `/clarify`, that skill passes a **context summary** (1 paragraph: what to build, intent, constraints). Use it as the baseline — do not re-ask questions already answered.

---

## Process

### Initialization — Create Task List

Before starting any step:

1. Call `ToolSearch` with query `"select:TaskCreate,TaskUpdate"` to load the schemas (required if not already loaded).
2. Then create all 5 tasks in a **single parallel batch** (one message, all 5 TaskCreate calls at once) so the user can see the full roadmap:

1. `subject`: "Gather context" / `activeForm`: "Gathering context"
2. `subject`: "Spike & explore project" / `activeForm`: "Exploring project"
3. `subject`: "Clarify requirements" / `activeForm`: "Clarifying requirements"
4. `subject`: "Evaluate complexity & propose solutions" / `activeForm`: "Proposing solutions"
5. `subject`: "Convergence — output & execution?" / `activeForm`: "Deciding output"

Do NOT set up `addBlockedBy` dependencies — skip the TaskUpdate dependency step entirely to keep initialization fast.

---

### [0+1. Context & Spike — Overlapped]
*(If entered from `/clarify`: skip context questions, go straight to spike)*

**TaskUpdate**: Mark tasks 1 and 2 as `in_progress` simultaneously.

**The core principle: ask questions and spike at the same time.** Every time you present questions to the user, also run exploration tools (Glob, Grep, Read) in the same message. The user reads and types while the agent works. Never wait idle.

---

**Message A — fire both in parallel:**
- `AskUserQuestion` Call 1 (3 questions):
  - **Current** (single): Greenfield / Existing code / Broken/buggy
  - **Objective** (single): New feature / Improvement / Fix/resolve
  - **Owner** (single): Me (dev) / My team / Handoff
- Spike pass 1: broad scan — Glob for project structure, README, config files, entry points.

**When user answers Call 1 — fire both in parallel:**
- `AskUserQuestion` Call 2 (2 questions):
  - **Output** (multi): Design doc / Diagram / Code plan / All of above
  - **Constraints** (multi): Time-boxed / Tech stack / Backward compat / Minimal scope
- Spike pass 2: targeted — use Call 1 answers to focus. If "Existing code", grep for related modules. If "New feature", read relevant configs/APIs. Begin drafting clarifying questions.

**When user answers Call 2:**
- Summarize context in 1–2 lines. **TaskUpdate**: Mark task 1 as `completed`.
- Present spike findings as a structured list (related modules, similar features, relevant configs).
- Ask which resources to go deeper on:

  **Resources** (multi, dynamic — max 4): \<Resource group 1\> / \<Resource group 2\> / All of them / None needed

- If user picks specific resources, dig into those. **TaskUpdate**: Mark task 2 as `completed`.
- If user picks "None needed", mark task 2 as `completed` immediately.

---

### [2. Clarify] — Asking Clarifying Questions
*(Skip entirely if entered from `/clarify` — requirements already established)*

**TaskUpdate**: Mark task 3 as `in_progress`.

One AskUserQuestion call per message. Prefer multiple choice. Focus on purpose, constraints, success criteria. Typically 2–4 questions total. Use spike findings to make questions specific and relevant.

Example: **Errors** (single): Fail fast / Retry + fallback / Silent log

**TaskUpdate**: Mark task 3 as `completed`.

---

### [3. Propose] — Evaluate Complexity & Propose Solutions

**TaskUpdate**: Mark task 4 as `in_progress`.

Do NOT ask the user about complexity. Judge it yourself from the spike findings and clarified requirements, then state the verdict in one line with the reason.

**Complex** (2+ viable approaches with real trade-offs, e.g. different architecture, data model, or dependency choices): Identify 2–3 candidate approaches (names + one-line description each). Do NOT do trade-off analysis here - that is decide's job.
-> Invoke skill **decide**, passing: the candidate options list + spike output as context. Decide will skip its [1. Frame] and [2. Research] steps.

**Simple** (one clear path, alternatives are obviously worse or trivial variations): Summarize the single approach in 1–3 lines and move straight to [4. Convergence Gate]. No confirmation question.

**TaskUpdate**: Mark task 4 as `completed`.

---

### [4. Convergence Gate] — Expected Output & Execution?

**TaskUpdate**: Mark task 5 as `in_progress`.

**Output** (single): Code it / Write it up / Estimate first / Done — design only

#### Chaining

| User picks | Action |
|-----------|--------|
| Code it | Call **EnterPlanMode** → write implementation plan from design output → call **ExitPlanMode** → invoke skill **implement**, pass approved plan; implement skips its planning phase |
| Write it up | Invoke skill **synthesize** — pass design output as context; synthesize skips content collection |
| Estimate first | Invoke skill **estimate** — pass spike output as context; estimate skips codebase exploration |
| Done | Write concise design summary. **Terminal state.** |

**TaskUpdate**: Mark task 5 as `completed`.

---

## Terminal States

- **"Done"** — brainstorming ends with a design summary. Do NOT write code.
- **"Code it"** — transition via EnterPlanMode/ExitPlanMode, then chain to `/implement`.
- **"Write it up"** — chain to `/synthesize`.
- **"Estimate first"** — chain to `/estimate`.

## Key Principles

- **One question at a time** — don't overwhelm (except Step 0 context form).
- **Multiple choice preferred** — easier to answer. Use `preview` for visual comparisons.
- **YAGNI ruthlessly** — remove unnecessary features from all designs.
- **Complex → delegate to decide** — never do trade-off analysis inline; that's decide's job.
- **Be flexible** — go back and clarify when something doesn't make sense.
- **Track progress** — always update task status.

## Additional Resources

- For the full process flow diagram, see [process-flow.md](process-flow.md).
