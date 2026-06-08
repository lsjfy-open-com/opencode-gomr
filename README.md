# OpenCode GOMR

Goal-Oriented Memory Runtime (GOMR) is a project-level OpenCode extension for preserving agent state without full-context reloads. It creates a local `.orca-memory` store, builds goal-oriented context plans, captures tool traces, and injects execution-ledger state into OpenCode sessions and compaction.

GOMR is intentionally not a vector database, embedding pipeline, GraphRAG system, or automatic memory-evolution engine. The MVP focuses on deterministic state continuity for coding agents.

## Why

Long coding sessions tend to accumulate:

- conversation history
- tool output
- code diffs
- command output
- repeated analysis
- compressed summaries

When a session is compacted, action state is easy to lose. Agents may re-read the same files, re-run the same commands, forget failed attempts, or miss why a decision was made.

GOMR treats tool state as first-class memory:

```text
Goal
  -> context plan
  -> minimal sufficient memory and workspace paths
  -> tool trace
  -> execution ledger
  -> compaction context
```

## Features

- Memory store bootstrap under `.orca-memory/`
- Workspace index generation
- Goal-oriented context plan generation
- Tool trace capture into JSONL
- Execution ledger updates for files read, commands run, files modified, failed attempts, and open questions
- Context-state snapshot generation
- Expanded visual export with turn timeline, graph view, tree view, compare view, node detail, auto-play, and latest-turn polling
- OpenCode plugin hooks for:
  - system context injection
  - tool trace capture
  - session compaction context
- `context-router` OpenCode agent
- `context-path-builder` OpenCode skill
- Windows and macOS/Linux installer scripts
- Node 24 test suite for validating installation

## Requirements

- OpenCode installed locally
- A target project that uses OpenCode project config
- Bun or Node.js 24+

OpenCode can load the bundled `.ts` plugin directly. The scripts are TypeScript/ESM and can run with Bun or Node.js 24+.

## Repository Layout

```text
.
+-- .opencode/
|   +-- agents/
|   |   +-- context-router.md
|   +-- gomr/
|   |   +-- build-context-state.ts
|   |   +-- capture-tool-trace.ts
|   |   +-- context-plan.ts
|   |   +-- gomr.ts
|   |   +-- gomr.test.ts
|   |   +-- memory-index.ts
|   |   +-- runtime.ts
|   +-- plugins/
|   |   +-- gomr.ts
|   +-- skills/
|       +-- context-path-builder/
|           +-- SKILL.md
+-- AGENTS.md
+-- AGENTS-GOMR.md
+-- install.ps1
+-- install.sh
+-- README.md
```

## Installation

GOMR supports two installation modes:

- **Global Install**: install once into the OpenCode user config directory. Every project opened by OpenCode can use the same GOMR plugin, and each project gets its own `.orca-memory`.
- **Project Install**: copy GOMR into one project's `.opencode/` directory. This is best when a team wants to commit the extension and pin its version per repository.

Use global install for personal default behavior across projects. Use project install for shared team repositories or experiments that should not affect other projects.

## Global Install

### Windows

From this repository directory:

```powershell
.\install-global.ps1
```

This installs to:

```text
%USERPROFILE%\.config\opencode
```

You can override the target:

```powershell
.\install-global.ps1 -ConfigPath "D:\custom\opencode-config"
```

### macOS/Linux

From this repository directory:

```bash
chmod +x ./install-global.sh
./install-global.sh
```

This installs to:

```text
~/.config/opencode
```

You can override the target:

```bash
./install-global.sh /custom/opencode-config
```

After global install, restart OpenCode. The plugin loads from the global config directory and creates `.orca-memory` inside each active project directory.

## Project Install

### Windows

From this repository directory:

```powershell
.\install.ps1 -ProjectPath "C:\path\to\your\project"
```

Then open or restart OpenCode in the target project.

### macOS/Linux

From this repository directory:

```bash
chmod +x ./install.sh
./install.sh /path/to/your/project
```

Then open or restart OpenCode in the target project.

### Manual Install

Copy these paths into the target project:

```text
.opencode/gomr/
.opencode/plugins/gomr.ts
.opencode/agents/context-router.md
.opencode/skills/context-path-builder/SKILL.md
```

Append `AGENTS-GOMR.md` to the target project's `AGENTS.md`. If the project has no `AGENTS.md`, create it from `AGENTS-GOMR.md`.

## Initialize Memory

From the target project, run:

```bash
bun .opencode/gomr/memory-index.ts init .
```

or:

```bash
node --no-warnings .opencode/gomr/memory-index.ts init .
```

This creates:

```text
.orca-memory/
+-- index.md
+-- index.json
+-- profile.md
+-- architecture.md
+-- goals.md
+-- modules/
|   +-- gomr-runtime.md
|   +-- context-router.md
|   +-- tool-trace.md
|   +-- visualization.md
+-- decisions/
|   +-- 0001-gomr-v0.2-memory-model.md
+-- tasks/
+-- sessions/
+-- pitfalls/
+-- traces/
+-- paths/
+|   +-- latest.json
+-- graph/
+|   +-- nodes.json
+|   +-- edges.json
+|   +-- timeline.json
+|   +-- graph-data.json
+-- cache/
|   +-- execution-ledger.md
|   +-- tool-trace.jsonl
|   +-- context-state.json
+|   +-- dirty-files.json
+-- visual/
+-- archive/
```

## Verify Installation

From the target project:

```bash
node --no-warnings --test .opencode/gomr/gomr.test.ts
```

Expected result:

```text
tests 27
pass 27
fail 0
```

## Commands

Unified v0.2 command wrapper:

```bash
node --no-warnings .opencode/gomr/gomr.ts init .
node --no-warnings .opencode/gomr/gomr.ts index .
node --no-warnings .opencode/gomr/gomr.ts trace append . --tool read --target src/parser.ts --status success --summary "Parser core"
node --no-warnings .opencode/gomr/gomr.ts ledger update .
node --no-warnings .opencode/gomr/gomr.ts plan . --goal "fix parser tests"
node --no-warnings .opencode/gomr/gomr.ts snapshot . --goal "fix parser tests"
node --no-warnings .opencode/gomr/gomr.ts graph build .
node --no-warnings .opencode/gomr/gomr.ts visual export .
node --no-warnings .opencode/gomr/gomr.ts visual serve . --port 8787
```

`visual export` writes a single-file static UI plus data:

```text
.orca-memory/visual/index.html
.orca-memory/visual/graph-data.json
```

The UI is a context path explainer rather than a telemetry dashboard. It shows:

- Turn Timeline with raw vs rebuilt context size, reused anchors, and new nodes
- Graph View that highlights the current turn path inside the global history graph
- Tree View that expands selected and excluded nodes with reasons and scores
- Compare View showing raw accumulated history vs GOMR rebuilt context
- Node Detail with trace metadata, digests, evidence path, relations, and anchor reuse

Build a context plan:

```bash
node --no-warnings .opencode/gomr/context-plan.ts . "fix parser tests"
```

Capture a tool trace manually:

```bash
node --no-warnings .opencode/gomr/capture-tool-trace.ts . read src/parser.ts success "Parser core"
```

Refresh context state:

```bash
node --no-warnings .opencode/gomr/build-context-state.ts .
```

Run the test suite:

```bash
node --no-warnings --test .opencode/gomr/gomr.test.ts
```

## Troubleshooting Empty Records

If `.orca-memory/index.md` exists but `.orca-memory/cache/tool-trace.jsonl` and
`.orca-memory/cache/execution-ledger.md` are empty, update to this version and
restart OpenCode.

Older GOMR versions re-ran `initMemory()` from
`experimental.chat.system.transform` on every chat turn and recreated runtime
cache files. That could erase records captured by `tool.execute.after`.

To recover what is still available:

1. Open `.orca-memory/cache/context-state.json`.
2. If it has a `ledger` field, copy that string back into
   `.orca-memory/cache/execution-ledger.md`.
3. Treat `.orca-memory/cache/tool-trace.jsonl` as best-effort only. If it was
   overwritten, exact JSONL entries cannot be fully recovered unless another
   backup or editor history still has them.
4. Run:

```bash
node --no-warnings .opencode/gomr/build-context-state.ts .
```

## OpenCode Lifecycle

The plugin uses OpenCode hooks:

- `experimental.chat.system.transform`
  - initializes `.orca-memory`
  - injects GOMR protocol
  - injects the current context plan
- `tool.execute.after`
  - records the tool, target, status, summary, digest, evidence, and relevance reason
  - appends durable JSONL under `.orca-memory/traces/session-<id>.jsonl`
  - mirrors traces to `.orca-memory/cache/tool-trace.jsonl` for compatibility
  - updates `.orca-memory/cache/execution-ledger.md`
  - refreshes `.orca-memory/cache/context-state.json`
  - refreshes `.orca-memory/paths/latest.json`, graph data, and visual export
- `experimental.session.compacting`
  - injects execution-ledger and context-state content into compaction

## Context Plan Shape

Example:

```json
{
  "goal": "fix parser tests",
  "memory": [
    ".orca-memory/profile.md",
    ".orca-memory/architecture.md",
    ".orca-memory/goals.md"
  ],
  "runtime_state": [
    ".orca-memory/cache/execution-ledger.md",
    ".orca-memory/cache/context-state.json",
    ".orca-memory/paths/latest.json"
  ],
  "workspace": [
    "tests/parser.test.ts",
    "src/parser.ts"
  ],
  "snapshot": {
    "turn_id": "turn-0001",
    "selected_path": [
      {
        "id": "goal/session-default/turn-0001",
        "type": "goal",
        "title": "fix parser tests",
        "summary": "fix parser tests",
        "reason": "The user goal is the root of the selected context path."
      }
    ],
    "excluded": [],
    "diff_from_previous_turn": {
      "added": [],
      "removed": [],
      "kept": []
    },
    "backtrack_candidates": []
  }
}
```

## Team Guidance

Recommended `.gitignore` entries for projects using GOMR:

```gitignore
.orca-memory/cache/
.orca-memory/archive/
```

Commit long-lived memory files only if your team wants shared project memory in git. Keep runtime traces local unless there is a clear review process.

## Bun Setup on Windows

If `bun` is installed but unavailable in `cmd` or PowerShell, check:

```powershell
Get-ChildItem -Recurse -Filter bun.exe "$env:USERPROFILE\.bun"
$env:Path -split ";" | Select-String "\\.bun\\bin"
```

If `bun.exe` exists under `%USERPROFILE%\.bun\bin`, add it to user PATH:

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:USERPROFILE\.bun\bin",
  "User"
)
```

Open a new terminal and run:

```powershell
bun --version
```

If `bun.exe` does not exist, install Bun with:

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm bun.sh/install.ps1 | iex"
```

or download the Windows release from Bun's GitHub releases, extract `bun.exe` to `%USERPROFILE%\.bun\bin`, and add that directory to PATH.

## Limitations

This MVP does not implement:

- embeddings
- vector search
- GraphRAG
- automatic memory evolution
- automatic conflict review for memory patches
- multi-project sync

## Roadmap

- Add memory patch review workflow
- Add session summary writer
- Add memory conflict detector
- Add richer context scoring
- Add explicit backtracking command
- Add optional package manager wrapper for Bun/Node selection

## License

MIT. See `LICENSE`.
