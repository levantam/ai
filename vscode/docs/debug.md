# Tami debug panel

Debug mode of the **Tami sidebar** (GoLand / Visual Studio style). When a debug session starts, the Tami tab is revealed and swaps to the debug page; **Exit** returns to the normal Tami view until the next session. `Tami: Debug View` opens it manually. Everything goes through the Debug Adapter Protocol, so it works with Go (delve), .NET (netcoredbg / vsdbg), Node, Python and others.

Flow diagram: `debug-flow.html` (open in a browser).

## What it does

| Feature | How |
|---------|-----|
| Toolbar | Continue, Pause, Step over/into/out, Restart, Stop (`workbench.action.debug.*`). |
| Call stack | DAP `threads` (goroutines / threads) + `stackTrace`; click a frame to jump to its source and make it the scope for locals and watches. |
| Locals | DAP `scopes` + `variables`, lazy tree for the selected frame. |
| Breakpoints | `vscode.debug.breakpoints`: jump, enable/disable, remove. |
| Launch picker | Reads `configurations` + `compounds` from every folder's `launch.json`; Start → `vscode.debug.startDebugging`, Stop → `stopDebugging`, Restart → `workbench.action.debug.restart`. |
| Watch by object path | Type `user.profile.items[0].name`, Enter. Evaluated with DAP `evaluate` (`context: "watch"`) in the active stack frame. |
| JSON tree | Containers expand lazily with DAP `variables`. Copy-as-JSON walks the tree (depth ≤ 6, ≤ 200 children per node) and puts pretty JSON on the clipboard. |
| Path history | Paths are stored in `workspaceState["debug.paths"]`, newest first, max 20. They survive reloads and sessions. |
| Auto-refresh | On every `onDidChangeActiveStackItem` (each pause / frame change) all saved paths are re-evaluated. |
| Autocomplete | Native `<datalist>`. Suggestions come from DAP `completions`; adapters without it fall back to `evaluate(parent)` + `variables`, or `scopes` for top-level names. |

## Files

- `src/debug.ts` — `DebugController` (used by `SidebarProvider`; DAP calls, launch actions) and `DEBUG_BODY`.
- `src/dap.ts` — pure helpers: `parentOf`, `treeToJson`. Checked by `src/debug.check.ts` (`node out/debug.check.js`).
- `media/debug.js`, `media/styles.css` (`.dbg` block) — panel UI.

## Webview ↔ extension messages

| From webview | Payload | Extension reply |
|--------------|---------|-----------------|
| `ready` | — | `state`, then one `value` per saved path |
| `addPath` / `removePath` | `{ path }` | `state` (+ `value` for a new path) |
| `eval` | `{ path }` | `value { path, result, kind, ref }` or `value { path, error }` |
| `expand` | `{ ref }` | `children { ref, vars: [{ name, value, type, ref }] }` |
| `json` | `{ path }` | clipboard write + status-bar message |
| `complete` | `{ text }` | `completions { items: string[] }` (full paths) |
| `start` | `{ folder, name }` | — |
| `stop` / `restart` | — | — |

`state` = `{ session: { name, type } | null, paused, configs: [{ folder, name }], paths }`.

## Limits (v1)

- 200 children per node, depth 6 for Copy-as-JSON, 50 completions, 20 saved paths.
- Leaf values are the adapter's display strings; `JSON.parse` is tried so numbers/strings/booleans come out typed.
- Variable references are only valid while paused; trees reset on each re-evaluation.
- Not included: exception toggles, editing values, conditional-breakpoint editing.
