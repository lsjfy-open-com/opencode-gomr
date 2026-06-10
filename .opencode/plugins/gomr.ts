import {
  buildContextState,
  buildContextForRequestGoal,
  captureToolTrace,
  compactingContext,
  contextPlan,
  exportVisual,
  gomrSystemContextText,
  initMemory,
  readCurrentGoal,
  readCurrentPlan,
} from "../gomr/runtime.ts"

export const id = "gomr"

const sessionProjects = new Map()
const sessionGoalsById = new Map()
let originalFetch

export const GomrPlugin = async ({ directory, worktree }) => {
  const project = directory || worktree
  const sessionGoals = new Map()
  installGomrReplacementFetch(project)
  return {
    "experimental.chat.system.transform": async (input, output) => {
      await initMemory(project)
      const userGoal = goalFromInput(input)
      const goal = userGoal || (await readCurrentGoal(project)) || "current OpenCode task"
      if (input?.sessionID && userGoal) {
        sessionGoals.set(input.sessionID, userGoal)
        sessionGoalsById.set(input.sessionID, userGoal)
      }
      if (input?.sessionID) sessionProjects.set(input.sessionID, project)
      const plan = userGoal
        ? await contextPlan(project, goal, { sessionId: input?.sessionID })
        : await readCurrentPlan(project)
      if (gomrMode() === "inject") output.system.push(gomrSystemContextText(plan))
    },
    "tool.execute.after": async (input, output) => {
      if (input?.sessionID) sessionProjects.set(input.sessionID, project)
      const goal =
        sessionGoals.get(input.sessionID) ||
        sessionGoalsById.get(input.sessionID) ||
        (await readCurrentGoal(project)) ||
        goalFromInput(input) ||
        "current OpenCode task"
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
      if (gomrMode() === "inject") output.context.push(await compactingContext(project))
    },
  }
}

export const server = GomrPlugin

export default { id, server: GomrPlugin }

export async function rewriteOpenCodeRequestForGomr(project, body, options = {}) {
  if (gomrMode() !== "replace") return body
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) return body
  if (!Array.isArray(body.tools) || body.tools.length === 0) return body

  const activeTurnMessages = activeTurnMessageSuffix(body.messages)
  if (activeTurnMessages.length === 0) return body

  const requestGoal = cleanGoal(contentText(activeTurnMessages[0]?.content || activeTurnMessages[0]?.text || activeTurnMessages[0]))
  if (requestGoal && options?.sessionId) sessionGoalsById.set(options.sessionId, requestGoal)
  const plan = requestGoal ? await contextPlan(project, requestGoal, { sessionId: options?.sessionId }) : await readCurrentPlan(project)
  const rebuilt = requestGoal ? await buildContextForRequestGoal(project, requestGoal) : undefined
  const gomrContext = rebuilt?.content || gomrSystemContextText(plan)
  const systemMessages = body.messages.filter((message) => {
    if (message?.role !== "system") return false
    return !contentText(message.content)?.includes("Goal-Oriented Memory Runtime")
  })

  return {
    ...body,
    messages: [
      ...systemMessages,
      {
        role: "system",
        content: gomrContext,
      },
      ...activeTurnMessages,
    ],
  }
}

function installGomrReplacementFetch(project) {
  if (originalFetch || typeof globalThis.fetch !== "function") return
  originalFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input, init) => {
    if (gomrMode() !== "replace") return originalFetch(input, init)
    let request
    try {
      request = new Request(input, init)
    } catch {
      return originalFetch(input, init)
    }
    const method = String(request.method || "GET").toUpperCase()
    if (method === "GET" || method === "HEAD") return originalFetch(request)

    const contentType = request.headers.get("content-type") || ""
    if (!contentType.includes("json")) return originalFetch(request)

    let body
    try {
      body = JSON.parse(await request.clone().text())
    } catch {
      return originalFetch(request)
    }

    const sessionId = request.headers.get("x-opencode-session") || request.headers.get("x-session-affinity") || body?.sessionID || body?.session_id
    const requestProject = sessionProjects.get(sessionId) || project
    const rewritten = await rewriteOpenCodeRequestForGomr(requestProject, body, { sessionId })
    if (rewritten === body) return originalFetch(request)

    const headers = new Headers(request.headers)
    headers.set("content-type", "application/json")
    headers.delete("content-length")
    return originalFetch(
      new Request(request, {
        headers,
        body: JSON.stringify(rewritten),
      }),
    )
  }
}

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

function activeTurnMessageSuffix(messages) {
  if (!Array.isArray(messages)) return []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role !== "user") continue
    if (contentText(message?.content || message?.text || message)) return messages.slice(index)
  }
  return []
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

function gomrMode() {
  const mode = String(process.env.GOMR_MODE || "replace").toLowerCase()
  if (mode === "inject") return "inject"
  if (mode === "observe") return "observe"
  return "replace"
}
