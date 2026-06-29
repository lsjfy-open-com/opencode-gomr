# Memory Index

## Memory Nodes

- `memory/profile` - Identifies the project and the GOMR runtime role.
- `memory/architecture` - Summarizes detected workspace areas used for context planning.
- `memory/goals` - Tracks GOMR continuity, context sufficiency, and traceability goals.
- `memory/modules/gomr-runtime` - Coordinates memory initialization, traces, ledgers, context paths, graph data, and compaction context.
- `memory/modules/context-router` - Selects minimal sufficient context based on the current goal, index, ledger, traces, and previous paths.
- `memory/modules/tool-trace` - Persists selected tool evidence with stable identity, target, status, digest, and relevance reason.
- `memory/modules/visualization` - Exports a static timeline and path graph that explains context path evolution.
- `memory/decisions/0001-gomr-v0.2-memory-model` - GOMR stores durable evidence locally while sending only selected context to the model.

## Workspace Files

- `.opencode/.gitignore` - node_modules
- `.opencode/agents/context-router.md` - ---
- `.opencode/gomr/build-context-state.ts` - import { buildContextState } from "./runtime.ts"
- `.opencode/gomr/capture-tool-trace.ts` - import { captureToolTrace } from "./runtime.ts"
- `.opencode/gomr/context-plan.ts` - import { contextPlan } from "./runtime.ts"
- `.opencode/gomr/gomr.test.ts` - import assert from "node:assert/strict"
- `.opencode/gomr/gomr.ts` - import http from "node:http"
- `.opencode/gomr/memory-index.ts` - import { initMemory } from "./runtime.ts"
- `.opencode/gomr/runtime.ts` - import { createHash } from "node:crypto"
- `.opencode/gomr/src/context/context-builder.ts` - import fs from "node:fs/promises"
- `.opencode/gomr/src/repo-graph/graphify-adapter.ts` - import fs from "node:fs/promises"
- `.opencode/gomr/src/repo-graph/static-repo-graph.ts` - import fs from "node:fs/promises"
- `.opencode/gomr/src/routing/goal-router.ts` - import fs from "node:fs/promises"
- `.opencode/package-lock.json` - {
- `.opencode/package.json` - Node package manifest
- `.opencode/plugins/gomr.ts` - import {
- `.opencode/skills/context-path-builder/SKILL.md` - ---
- `AGENTS.md` - Agent operating instructions
- `README.md` - Project documentation
