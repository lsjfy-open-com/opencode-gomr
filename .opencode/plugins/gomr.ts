import {
  buildContextState,
  captureToolTrace,
  compactingContext,
  contextPlan,
  exportVisual,
  gomrSystemContextText,
  initMemory,
  readCurrentGoal,
  readCurrentPlan,
} from "../gomr/runtime.ts"

export const GomrPlugin = async ({ directory, worktree }) => {
  const project = directory || worktree
  const sessionGoals = new Map()
  return {
    "experimental.chat.system.transform": async (input, output) => {
      await initMemory(project)
      const userGoal = goalFromInput(input)
      const goal = userGoal || (await readCurrentGoal(project)) || "current OpenCode task"
      if (input?.sessionID) sessionGoals.set(input.sessionID, goal)
      const plan = userGoal
        ? await contextPlan(project, goal, { sessionId: input?.sessionID })
        : await readCurrentPlan(project)
      output.system.push(gomrSystemContextText(plan))
    },
    "tool.execute.after": async (input, output) => {
      const goal = sessionGoals.get(input.sessionID) || (await readCurrentGoal(project)) || goalFromInput(input) || "current OpenCode task"
      await captureToolTrace(
        project,
        input.tool,
        normalizeTarget(input.args),
        "success",
        output.title || String(output.output || "").slice(0, 160) || "Tool completed",
        { sessionId: input.sessionID, output: String(output.output || "") },
      )
      await buildContextState(project)
      await contextPlan(project, goal, { sessionId: input.sessionID })
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

function goalFromInput(input) {
  const fromMessages = latestUserMessage(input?.messages || input?.conversation || input?.history)
  return cleanGoal(
    fromMessages ||
      contentText(input?.goal) ||
      contentText(input?.prompt) ||
      contentText(input?.message) ||
      contentText(input?.context?.goal) ||
      contentText(input?.session?.title),
  )
}

function latestUserMessage(messages) {
  if (!Array.isArray(messages)) return undefined
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role && message.role !== "user") continue
    const text = contentText(message?.content || message?.text || message)
    if (text) return text
  }
  return undefined
}

function contentText(value) {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("\n")
  if (value && typeof value === "object") return contentText(value.text || value.content || value.value)
  return undefined
}

function cleanGoal(value) {
  const clean = value?.replace(/\s+/g, " ").trim()
  if (!clean || clean === "current OpenCode task" || clean === "Current OpenCode task") return undefined
  const firstSentence = clean.split(/[.?!。？！\n]\s*/)[0].trim()
  const best = firstSentence || clean
  return best.length > 240 ? `${best.slice(0, 237)}...` : best
}
