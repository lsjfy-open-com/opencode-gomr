---
name: context-path-builder
description: Build a minimal sufficient GOMR context plan for an OpenCode task.
---

# Context Path Builder

Use this skill before reading many files or asking OpenCode to resume work from compressed context.

## Steps

1. Identify the concrete goal, current package or module, and likely file scope.
2. Read `.orca-memory/cache/execution-ledger.md` for files already read, commands already run, files modified, failed attempts, and open questions.
3. Use `.orca-memory/index.json` to choose memory and workspace paths.
4. Build a context plan with `memory`, `runtime_state`, and `workspace` arrays.
5. Load only the selected paths and keep Tool Trace evidence attached to decisions.

## Guardrails

- Do not full-load `.orca-memory`.
- Do not directly overwrite memory.
- Keep Tool Trace state ahead of conversation summary.
- Prefer fresh workspace state for files named in the context plan.
- If context is insufficient, backtrack through execution ledger, Tool Trace, memory index, and workspace lookup in that order.
