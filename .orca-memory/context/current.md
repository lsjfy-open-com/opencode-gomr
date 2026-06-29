# GOMR Rebuilt Context

mode: replace
raw_context_replaced: true

## Current Goal

- id: implement-adapter
- summary: implement adapter
- routing: goal-conditioned-ppr
- llmUsedForRouting: false

## Context Bundles

### Runtime Context
- id: bundle/runtime-context
- type: runtime_context
- score: 0.7165
- reason: Grouped by source area and selected after goal-conditioned scoring.
Goal-relevant runtime context materials selected by deterministic routing.

## Selected Materials

### .opencode/gomr/src/repo-graph/graphify-adapter.ts
- id: material/repo/opencode-gomr-src-repo-graph-graphify-adapter-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/src/repo-graph/graphify-adapter.ts
- score: 0.7165
- reason: Matches goal terms: adapter.
import fs from "node:fs/promises"

### .opencode/gomr/src/context/context-builder.ts
- id: material/repo/opencode-gomr-src-context-context-builder-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/src/context/context-builder.ts
- score: 0.634
- reason: Connected through repo graph proximity and source importance.
import fs from "node:fs/promises"

### .opencode/gomr/gomr.test.ts
- id: material/repo/opencode-gomr-gomr-test-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/gomr.test.ts
- score: 0.6284
- reason: Connected through repo graph proximity and source importance.
import assert from "node:assert/strict"

### .opencode/gomr/runtime.ts
- id: material/repo/opencode-gomr-runtime-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/runtime.ts
- score: 0.6247
- reason: Connected through repo graph proximity and source importance.
import { createHash } from "node:crypto"

### .opencode/gomr/src/routing/goal-router.ts
- id: material/repo/opencode-gomr-src-routing-goal-router-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/src/routing/goal-router.ts
- score: 0.6206
- reason: Connected through repo graph proximity and source importance.
import fs from "node:fs/promises"

### .opencode/gomr/context-plan.ts
- id: material/repo/opencode-gomr-context-plan-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/context-plan.ts
- score: 0.6204
- reason: Connected through repo graph proximity and source importance.
import { contextPlan } from "./runtime.ts"

### .opencode/gomr/src/repo-graph/static-repo-graph.ts
- id: material/repo/opencode-gomr-src-repo-graph-static-repo-graph-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/src/repo-graph/static-repo-graph.ts
- score: 0.6152
- reason: Connected through repo graph proximity and source importance.
import fs from "node:fs/promises"

### .opencode/gomr/build-context-state.ts
- id: material/repo/opencode-gomr-build-context-state-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/build-context-state.ts
- score: 0.6147
- reason: Connected through repo graph proximity and source importance.
import { buildContextState } from "./runtime.ts"

### .opencode/gomr/capture-tool-trace.ts
- id: material/repo/opencode-gomr-capture-tool-trace-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/capture-tool-trace.ts
- score: 0.6126
- reason: Connected through repo graph proximity and source importance.
import { captureToolTrace } from "./runtime.ts"

### .opencode/gomr/gomr.ts
- id: material/repo/opencode-gomr-gomr-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/gomr.ts
- score: 0.6095
- reason: Connected through repo graph proximity and source importance.
import http from "node:http"

### .opencode/plugins/gomr.ts
- id: material/repo/opencode-plugins-gomr-ts
- bundle: bundle/runtime-context
- source: .opencode/plugins/gomr.ts
- score: 0.6009
- reason: Connected through repo graph proximity and source importance.
import {

### .opencode/gomr/memory-index.ts
- id: material/repo/opencode-gomr-memory-index-ts
- bundle: bundle/runtime-context
- source: .opencode/gomr/memory-index.ts
- score: 0.6002
- reason: Connected through repo graph proximity and source importance.
import { initMemory } from "./runtime.ts"

## Evidence / Anchors

### Evidence for .opencode/gomr/src/repo-graph/graphify-adapter.ts
- id: evidence/material-repo-opencode-gomr-src-repo-graph-graphify-adapter-ts
- material: material/repo/opencode-gomr-src-repo-graph-graphify-adapter-ts
- type: trace_summary
- source: .opencode/gomr/src/repo-graph/graphify-adapter.ts
Selected because Matches goal terms: adapter.

### Evidence for .opencode/gomr/src/context/context-builder.ts
- id: evidence/material-repo-opencode-gomr-src-context-context-builder-ts
- material: material/repo/opencode-gomr-src-context-context-builder-ts
- type: trace_summary
- source: .opencode/gomr/src/context/context-builder.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/gomr.test.ts
- id: evidence/material-repo-opencode-gomr-gomr-test-ts
- material: material/repo/opencode-gomr-gomr-test-ts
- type: trace_summary
- source: .opencode/gomr/gomr.test.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/runtime.ts
- id: evidence/material-repo-opencode-gomr-runtime-ts
- material: material/repo/opencode-gomr-runtime-ts
- type: trace_summary
- source: .opencode/gomr/runtime.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/src/routing/goal-router.ts
- id: evidence/material-repo-opencode-gomr-src-routing-goal-router-ts
- material: material/repo/opencode-gomr-src-routing-goal-router-ts
- type: trace_summary
- source: .opencode/gomr/src/routing/goal-router.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/context-plan.ts
- id: evidence/material-repo-opencode-gomr-context-plan-ts
- material: material/repo/opencode-gomr-context-plan-ts
- type: trace_summary
- source: .opencode/gomr/context-plan.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/src/repo-graph/static-repo-graph.ts
- id: evidence/material-repo-opencode-gomr-src-repo-graph-static-repo-graph-ts
- material: material/repo/opencode-gomr-src-repo-graph-static-repo-graph-ts
- type: trace_summary
- source: .opencode/gomr/src/repo-graph/static-repo-graph.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/build-context-state.ts
- id: evidence/material-repo-opencode-gomr-build-context-state-ts
- material: material/repo/opencode-gomr-build-context-state-ts
- type: trace_summary
- source: .opencode/gomr/build-context-state.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/capture-tool-trace.ts
- id: evidence/material-repo-opencode-gomr-capture-tool-trace-ts
- material: material/repo/opencode-gomr-capture-tool-trace-ts
- type: trace_summary
- source: .opencode/gomr/capture-tool-trace.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/gomr.ts
- id: evidence/material-repo-opencode-gomr-gomr-ts
- material: material/repo/opencode-gomr-gomr-ts
- type: trace_summary
- source: .opencode/gomr/gomr.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/plugins/gomr.ts
- id: evidence/material-repo-opencode-plugins-gomr-ts
- material: material/repo/opencode-plugins-gomr-ts
- type: trace_summary
- source: .opencode/plugins/gomr.ts
Selected because Connected through repo graph proximity and source importance.

### Evidence for .opencode/gomr/memory-index.ts
- id: evidence/material-repo-opencode-gomr-memory-index-ts
- material: material/repo/opencode-gomr-memory-index-ts
- type: trace_summary
- source: .opencode/gomr/memory-index.ts
Selected because Connected through repo graph proximity and source importance.

## Explicitly Excluded Raw Context

- .opencode/skills/context-path-builder/SKILL.md: Excluded because higher-scoring materials satisfy the current goal.
- .opencode/agents/context-router.md: Excluded because higher-scoring materials satisfy the current goal.
- README.md: Excluded because higher-scoring materials satisfy the current goal.
- docs/superpowers/plans/2026-06-08-gomr-v0.2.md: Excluded because higher-scoring materials satisfy the current goal.
- docs/superpowers/specs/2026-06-08-gomr-v0.2-design.md: Excluded because higher-scoring materials satisfy the current goal.
- .opencode/package.json: Excluded because higher-scoring materials satisfy the current goal.
- .opencode/.gitignore: Excluded because higher-scoring materials satisfy the current goal.
- .opencode/package-lock.json: Excluded because higher-scoring materials satisfy the current goal.

## Local Retention

- Raw history, traces, and repo graph remain local under `.orca-memory`.
- Replace mode sends this rebuilt context instead of the full accumulated conversation.
- Tool results from the active turn may still be retained after the latest user message.
