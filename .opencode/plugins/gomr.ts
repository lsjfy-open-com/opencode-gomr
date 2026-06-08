import { buildContextState, captureToolTrace, compactingContext, contextPlan, exportVisual, initMemory } from "../gomr/runtime.ts"

export const GomrPlugin = async ({ directory, worktree }) => {
  const project = directory || worktree
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      await initMemory(project)
      output.system.push(
        [
          "## Goal-Oriented Memory Runtime",
          "",
          "Follow GOMR before broad workspace reads:",
          "- Read `.orca-memory/cache/execution-ledger.md` for action state continuity.",
          "- Build a context-plan and load only goal-relevant memory and workspace files.",
          "- Prefer tool trace and execution ledger state over conversation recall.",
          "- Never full-load `.orca-memory`; never directly overwrite memory files without a patch-style review.",
          "",
          "Current context-plan:",
          JSON.stringify(await contextPlan(project, "current OpenCode task"), null, 2),
        ].join("\n"),
      )
    },
    "tool.execute.after": async (input, output) => {
      await captureToolTrace(
        project,
        input.tool,
        normalizeTarget(input.args),
        "success",
        output.title || String(output.output || "").slice(0, 160) || "Tool completed",
        { sessionId: input.sessionID, output: String(output.output || "") },
      )
      await buildContextState(project)
      await contextPlan(project, "current OpenCode task", { sessionId: input.sessionID })
      await exportVisual(project)
    },
    "experimental.session.compacting": async (_input, output) => {
      output.context.push(await compactingContext(project))
    },
  }
}

export default GomrPlugin

function normalizeTarget(args) {
  if (typeof args?.filePath === "string") return args.filePath
  if (typeof args?.path === "string") return args.path
  if (typeof args?.command === "string") return args.command
  return "unknown"
}
