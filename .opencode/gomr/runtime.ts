import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const memoryRoot = ".orca-memory"
const cacheRoot = path.join(memoryRoot, "cache")
const traceRoot = path.join(memoryRoot, "traces")
const pathsRoot = path.join(memoryRoot, "paths")
const graphRoot = path.join(memoryRoot, "graph")
const visualRoot = path.join(memoryRoot, "visual")
const ignoredDirs = new Set([".git", "node_modules", ".orca-memory", "dist", "build", ".next", ".turbo"])
const rootFiles = new Set(["README.md", "package.json", "tsconfig.json", "pyproject.toml", "go.mod", "AGENTS.md"])
const sourceDirs = new Set(["src", "test", "tests", "packages", ".opencode"])

const seedMemoryNodes = [
  {
    path: "profile.md",
    id: "memory/profile",
    type: "profile",
    title: "Project Profile",
    summary: "Identifies the project and the GOMR runtime role.",
    details: (project: string) => `Root: ${project}\n\nRuntime: OpenCode Goal-Oriented Memory Runtime.`,
    related: ["memory/architecture", "memory/goals"],
  },
  {
    path: "architecture.md",
    id: "memory/architecture",
    type: "architecture",
    title: "Architecture",
    summary: "Summarizes detected workspace areas used for context planning.",
    details: async (project: string) => {
      const files = await scanProject(project)
      const areas = [...new Set(files.map((file) => file.path.split("/")[0]))]
      return areas.length ? areas.map((area) => `- ${area}`).join("\n") : "Initial memory seed. Update after first task execution."
    },
    related: ["memory/modules/gomr-runtime", "memory/modules/context-router"],
  },
  {
    path: "goals.md",
    id: "memory/goals",
    type: "profile",
    title: "Goals",
    summary: "Tracks GOMR continuity, context sufficiency, and traceability goals.",
    details: () =>
      [
        "- Preserve goal sufficiency, state continuity, decision traceability, and workspace freshness.",
        "- Prefer planned context paths over full memory loading.",
        "- Keep tool trace and execution ledger state stable across compression.",
      ].join("\n"),
    related: ["memory/modules/context-router", "memory/modules/tool-trace"],
  },
  {
    path: "modules/gomr-runtime.md",
    id: "memory/modules/gomr-runtime",
    type: "module",
    title: "GOMR Runtime",
    summary: "Coordinates memory initialization, traces, ledgers, context paths, graph data, and compaction context.",
    details: () => "The runtime owns deterministic local state and writes durable artifacts under `.orca-memory/`.",
    related: ["memory/modules/context-router", "memory/modules/tool-trace", "memory/modules/visualization"],
  },
  {
    path: "modules/context-router.md",
    id: "memory/modules/context-router",
    type: "module",
    title: "Context Router",
    summary: "Selects minimal sufficient context based on the current goal, index, ledger, traces, and previous paths.",
    details: () => "The context router scores candidates and records why selected and excluded nodes matter.",
    related: ["memory/goals", "memory/modules/gomr-runtime"],
  },
  {
    path: "modules/tool-trace.md",
    id: "memory/modules/tool-trace",
    type: "module",
    title: "Tool Trace",
    summary: "Persists selected tool evidence with stable identity, target, status, digest, and relevance reason.",
    details: () => "Tool traces live under `.orca-memory/traces/` and are mirrored to the legacy cache file for compatibility.",
    related: ["memory/modules/gomr-runtime", "memory/modules/context-router"],
  },
  {
    path: "modules/visualization.md",
    id: "memory/modules/visualization",
    type: "module",
    title: "Visualization",
    summary: "Exports a static timeline and path graph that explains context path evolution.",
    details: () => "The first visual export is a single static HTML file with polling for refreshed graph and latest path data.",
    related: ["memory/modules/context-router", "memory/modules/tool-trace"],
  },
  {
    path: "decisions/0001-gomr-v0.2-memory-model.md",
    id: "memory/decisions/0001-gomr-v0.2-memory-model",
    type: "decision",
    title: "GOMR v0.2 Memory Model",
    summary: "GOMR stores durable evidence locally while sending only selected context to the model.",
    details: () => "Local traces, paths, and graph data are retained. Compression affects model input only, not stored evidence.",
    related: ["memory/modules/gomr-runtime", "memory/modules/visualization"],
  },
]

export async function initMemory(project: string) {
  await Promise.all(
    [
      memoryRoot,
      path.join(memoryRoot, "modules"),
      path.join(memoryRoot, "decisions"),
      path.join(memoryRoot, "tasks"),
      path.join(memoryRoot, "sessions"),
      path.join(memoryRoot, "pitfalls"),
      traceRoot,
      pathsRoot,
      graphRoot,
      cacheRoot,
      visualRoot,
      path.join(memoryRoot, "archive"),
    ].map((dir) => fs.mkdir(path.join(project, dir), { recursive: true })),
  )

  for (const node of seedMemoryNodes) {
    await writeFileIfMissing(path.join(project, memoryRoot, node.path), await memoryMarkdown(project, node))
  }
  await writeFileIfMissing(path.join(project, cacheRoot, "execution-ledger.md"), ledgerMarkdown())
  await writeFileIfMissing(path.join(project, cacheRoot, "tool-trace.jsonl"), "")
  await writeFileIfMissing(path.join(project, cacheRoot, "dirty-files.json"), "[]\n")
  await writeFileIfMissing(path.join(project, pathsRoot, "latest.json"), JSON.stringify(bootstrapSnapshot(), null, 2))
  await writeGraphSeed(project)

  await fs.writeFile(
    path.join(project, memoryRoot, "index.json"),
    JSON.stringify(
      {
        version: 2,
        generated_at: new Date().toISOString(),
        project_root: project,
        memory_nodes: seedMemoryNodes.map(({ id, path: nodePath, type, title, summary }) => ({
          id,
          path: `.orca-memory/${nodePath}`,
          type,
          title,
          summary,
        })),
        files: await scanProject(project),
      },
      null,
      2,
    ),
    "utf8",
  )
  await fs.writeFile(path.join(project, memoryRoot, "index.md"), await indexMarkdown(project), "utf8")
}

export async function contextPlan(project: string, goal: string, options: { sessionId?: string; tokenBudget?: number } = {}) {
  await ensureMemory(project)
  const sessionId = normalizeSessionId(options.sessionId)
  const turnId = await nextTurnId(project)
  const terms = goalTerms(goal)
  const index = await readIndex(project)
  const scoredFiles = scoreFiles(index.files, terms)
  const traces = await readTraces(project)
  const recentTraces = traces.slice(-8)
  const memoryPaths = [
    ".orca-memory/profile.md",
    ".orca-memory/architecture.md",
    ".orca-memory/goals.md",
    ".orca-memory/modules/gomr-runtime.md",
    ".orca-memory/modules/context-router.md",
    ".orca-memory/modules/tool-trace.md",
    ".orca-memory/modules/visualization.md",
  ]
  const plan = {
    goal,
    memory: memoryPaths,
    runtime_state: [
      ".orca-memory/cache/execution-ledger.md",
      ".orca-memory/cache/context-state.json",
      ".orca-memory/paths/latest.json",
    ],
    workspace: scoredFiles.slice(0, 8).map((file) => file.path),
  }
  const snapshot = await writePathSnapshot(project, {
    sessionId,
    turnId,
    goal,
    memoryPaths,
    scoredFiles,
    recentTraces,
    tokenBudget: options.tokenBudget ?? 8000,
  })
  await fs.writeFile(
    path.join(project, cacheRoot, "execution-ledger.md"),
    updateCurrentGoal(await fs.readFile(path.join(project, cacheRoot, "execution-ledger.md"), "utf8"), goal, turnId),
    "utf8",
  )
  await buildGraphData(project)
  return { ...plan, snapshot }
}

export async function captureToolTrace(
  project: string,
  toolName: string,
  target: string,
  status: string,
  summary: string,
  options: { sessionId?: string; turnId?: string; operation?: string; goal?: string; output?: string } = {},
) {
  await ensureMemory(project)
  const sessionId = normalizeSessionId(options.sessionId)
  const turnId = options.turnId ?? (await nextTurnId(project))
  const normalizedTarget = normalizePath(target)
  const outputSummary = summary || "Tool completed"
  const trace = {
    id: `trace/${sessionId}/${turnId}/${slug(`${toolName}-${normalizedTarget}`)}`,
    session_id: sessionId,
    turn_id: turnId,
    timestamp: new Date().toISOString(),
    tool: toolName,
    target: normalizedTarget,
    operation: options.operation ?? operationName(toolName, normalizedTarget),
    status,
    summary: outputSummary,
    input_digest: await digestForTarget(project, normalizedTarget),
    output_digest: digest(options.output ?? outputSummary),
    evidence: evidenceForTarget(normalizedTarget),
    context_relevance: {
      goal_match: goalMatchScore(options.goal ?? "current goal", `${normalizedTarget} ${outputSummary}`),
      reason: `Related to the current goal through ${toolName} on ${normalizedTarget}.`,
    },
  }

  await fs.appendFile(path.join(project, traceRoot, `${sessionId}.jsonl`), `${JSON.stringify(trace)}\n`, "utf8")
  await fs.appendFile(path.join(project, cacheRoot, "tool-trace.jsonl"), `${JSON.stringify(trace)}\n`, "utf8")
  await fs.writeFile(
    path.join(project, cacheRoot, "execution-ledger.md"),
    updateLedger(await fs.readFile(path.join(project, cacheRoot, "execution-ledger.md"), "utf8"), trace),
    "utf8",
  )
  await buildContextState(project)
  return trace
}

export async function buildContextState(project: string) {
  await ensureMemory(project)
  const traces = await readTraces(project)
  const state = {
    generated_at: new Date().toISOString(),
    indexed_files: (await readIndex(project)).files.length,
    trace_count: traces.length,
    recent_tools: [...new Set(traces.slice(-10).map((trace) => trace.tool))],
    recent_targets: traces.slice(-10).map((trace) => trace.target),
    latest_path: await readLatestSnapshot(project),
    ledger: await fs.readFile(path.join(project, cacheRoot, "execution-ledger.md"), "utf8"),
  }
  await fs.writeFile(path.join(project, cacheRoot, "context-state.json"), JSON.stringify(state, null, 2), "utf8")
  return state
}

export async function buildGraphData(project: string) {
  await ensureMemory(project)
  const nodes = new Map<string, any>()
  const edges = new Map<string, any>()
  const timeline: any[] = []

  for (const seed of seedMemoryNodes) {
    nodes.set(seed.id, {
      id: seed.id,
      type: seed.type === "decision" ? "decision" : "memory",
      title: seed.title,
      summary: seed.summary,
      source: `.orca-memory/${seed.path}`,
      status: "active",
      createdAt: new Date().toISOString(),
      tags: [seed.type],
    })
  }

  const index = await readIndex(project)
  for (const file of index.files.slice(0, 120)) {
    const id = `workspace/${file.path}`
    nodes.set(id, {
      id,
      type: "workspace",
      title: file.path,
      summary: file.summary || "Indexed workspace file",
      source: file.path,
      status: "active",
      createdAt: file.updated_at,
      updatedAt: file.updated_at,
      tags: [file.kind],
    })
  }

  for (const trace of await readTraces(project)) {
    nodes.set(trace.id, {
      id: trace.id,
      type: trace.status === "failed" || trace.status === "error" ? "error" : trace.tool === "shell" || trace.tool === "bash" ? "command" : "trace",
      title: `${trace.tool}: ${trace.target}`,
      summary: trace.summary,
      source: `.orca-memory/traces/${trace.session_id}.jsonl`,
      status: trace.status,
      createdAt: trace.timestamp,
      score: trace.context_relevance?.goal_match,
      tags: [trace.tool],
    })
  }

  for (const snapshot of await readSnapshots(project)) {
    timeline.push({
      turn_id: snapshot.turn_id,
      session_id: snapshot.session_id,
      title: snapshot.goal.title,
      summary: snapshot.goal.summary,
      created_at: snapshot.created_at,
    })
    nodes.set(snapshot.goal.id, {
      id: snapshot.goal.id,
      type: "goal",
      title: snapshot.goal.title,
      summary: snapshot.goal.summary,
      source: "user_request",
      status: "active",
      createdAt: snapshot.created_at,
      score: 1,
    })
    for (const node of snapshot.selected_path) {
      nodes.set(node.id, {
        id: node.id,
        type: node.type,
        title: node.title,
        summary: node.summary,
        source: node.source,
        status: "active",
        createdAt: snapshot.created_at,
        score: node.score,
        tags: [snapshot.turn_id],
      })
      const edgeId = `edge/${snapshot.turn_id}/${slug(`${snapshot.goal.id}-${node.id}`)}`
      edges.set(edgeId, {
        id: edgeId,
        from: snapshot.goal.id,
        to: node.id,
        type: "selected_for_goal",
        summary: node.reason || "Selected for this goal.",
        weight: node.score,
        turnId: snapshot.turn_id,
        sessionId: snapshot.session_id,
      })
    }
  }

  const graph = {
    generated_at: new Date().toISOString(),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    timeline: timeline.sort((a, b) => a.turn_id.localeCompare(b.turn_id)),
  }
  await fs.writeFile(path.join(project, graphRoot, "nodes.json"), JSON.stringify(graph.nodes, null, 2), "utf8")
  await fs.writeFile(path.join(project, graphRoot, "edges.json"), JSON.stringify(graph.edges, null, 2), "utf8")
  await fs.writeFile(path.join(project, graphRoot, "timeline.json"), JSON.stringify(graph.timeline, null, 2), "utf8")
  await fs.writeFile(path.join(project, graphRoot, "graph-data.json"), JSON.stringify(graph, null, 2), "utf8")
  return graph
}

export async function exportVisual(project: string) {
  await ensureMemory(project)
  const graph = await buildGraphData(project)
  await fs.writeFile(path.join(project, visualRoot, "graph-data.json"), JSON.stringify(graph, null, 2), "utf8")
  await fs.writeFile(path.join(project, visualRoot, "index.html"), visualHtml(), "utf8")
}

export async function compactingContext(project: string) {
  await ensureMemory(project)
  return [
    "## GOMR Execution Ledger",
    await fs.readFile(path.join(project, cacheRoot, "execution-ledger.md"), "utf8"),
    "## GOMR Context State",
    JSON.stringify(await buildContextState(project), null, 2),
  ].join("\n\n")
}

async function ensureMemory(project: string) {
  if (await exists(path.join(project, memoryRoot, "index.json"))) return
  await initMemory(project)
}

async function scanProject(project: string) {
  return (await scanDir(project, project))
    .filter((file) => rootFiles.has(file.path) || sourceDirs.has(file.path.split("/")[0]))
    .slice(0, 400)
}

async function scanDir(root: string, dir: string) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(dir, entry.name)
      const relative = normalizePath(path.relative(root, absolute))
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) return []
        return scanDir(root, absolute)
      }
      if (!entry.isFile()) return []
      if (entry.name.endsWith(".map") || entry.name.endsWith(".lock")) return []
      return [
        {
          path: relative,
          kind: fileKind(relative),
          summary: await fileSummary(absolute, relative),
          updated_at: new Date((await fs.stat(absolute)).mtimeMs).toISOString(),
        },
      ]
    }),
  )
  return files.flat()
}

async function fileSummary(file: string, relative: string) {
  const known = {
    "README.md": "Project documentation",
    "package.json": "Node package manifest",
    "tsconfig.json": "TypeScript compiler configuration",
    "pyproject.toml": "Python project manifest",
    "go.mod": "Go module manifest",
    "AGENTS.md": "Agent operating instructions",
  } as Record<string, string>
  if (known[path.basename(relative)]) return known[path.basename(relative)]
  return fs
    .readFile(file, "utf8")
    .then((text) => text.split("\n").find((line) => line.trim().length > 0)?.trim().slice(0, 120) ?? "Indexed workspace file")
    .catch(() => "Indexed workspace file")
}

function scoreFiles(files: Array<{ path: string; summary: string; kind: string }>, terms: string[]) {
  return files
    .map((file) => {
      const haystack = `${file.path} ${file.summary} ${file.kind}`.toLowerCase()
      const goalHits = terms.filter((term) => haystack.includes(term)).length
      const score = goalHits * 10 + (file.kind === "source" ? 3 : file.kind === "test" ? 2 : 1)
      return { ...file, score, breakdown: scoreBreakdown(goalHits, file.kind) }
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
}

async function writePathSnapshot(
  project: string,
  input: {
    sessionId: string
    turnId: string
    goal: string
    memoryPaths: string[]
    scoredFiles: Array<{ path: string; summary: string; kind: string; score: number; breakdown: Record<string, number> }>
    recentTraces: any[]
    tokenBudget: number
  },
) {
  const createdAt = new Date().toISOString()
  const goalNode = {
    id: `goal/${input.sessionId}/${input.turnId}`,
    type: "goal",
    title: titleFromGoal(input.goal),
    summary: input.goal || "Current OpenCode task",
    source: "user_request",
    reason: "The user goal is the root of the selected context path.",
    score: 1,
    breakdown: {
      goal_match: 0.35,
      state_continuity: 0.2,
      importance: 0.15,
      freshness: 0.1,
      dependency: 0.1,
      backtrack_value: 0.1,
    },
  }
  const memoryNodes = seedMemoryNodes.slice(0, 7).map((node, index) => ({
    id: node.id,
    type: node.type === "decision" ? "decision" : "memory",
    title: node.title,
    summary: node.summary,
    source: `.orca-memory/${node.path}`,
    reason: index === 0 ? "Project identity anchors context reconstruction." : `Supports ${node.title.toLowerCase()} for this goal.`,
    score: Number((0.92 - index * 0.03).toFixed(2)),
    breakdown: scoreBreakdown(1, "memory"),
  }))
  const workspaceNodes = input.scoredFiles.slice(0, 5).map((file) => ({
    id: `workspace/${file.path}`,
    type: "workspace",
    title: file.path,
    summary: file.summary || "Indexed workspace file",
    source: file.path,
    reason: "Workspace file matched the current goal terms or source priority.",
    score: normalizeScore(file.score),
    breakdown: file.breakdown,
  }))
  const traceNodes = input.recentTraces.slice(-4).map((trace) => ({
    id: trace.id,
    type: trace.status === "failed" || trace.status === "error" ? "error" : "trace",
    title: `${trace.tool}: ${trace.target}`,
    summary: trace.summary,
    source: `.orca-memory/traces/${trace.session_id}.jsonl`,
    reason: trace.context_relevance?.reason ?? "Recent trace preserves action-state continuity.",
    score: trace.context_relevance?.goal_match ?? 0.72,
    breakdown: scoreBreakdown(1, "trace"),
  }))
  const selectedPath = [goalNode, ...memoryNodes, ...workspaceNodes, ...traceNodes]
  const selectedIds = new Set(selectedPath.map((node) => node.id))
  const excluded = input.scoredFiles
    .slice(5, 10)
    .map((file) => ({
      id: `workspace/${file.path}`,
      type: "workspace",
      title: file.path,
      summary: file.summary || "Indexed workspace file",
      reason: "Lower score than selected files within the token budget.",
    }))
    .concat(
      seedMemoryNodes
        .filter((node) => !selectedIds.has(node.id))
        .map((node) => ({
          id: node.id,
          type: node.type === "decision" ? "decision" : "memory",
          title: node.title,
          summary: node.summary,
          reason: "Not required for this turn's minimal context path.",
        })),
    )
  const previous = await readLatestSnapshot(project)
  const previousIds = new Set(previous.selected_path?.map((node) => node.id) ?? [])
  const currentIds = new Set(selectedPath.map((node) => node.id))
  const diff = {
    added: [...currentIds].filter((id) => !previousIds.has(id)),
    removed: [...previousIds].filter((id) => !currentIds.has(id)),
    kept: [...currentIds].filter((id) => previousIds.has(id)),
  }
  const backtrackCandidates = input.recentTraces.map((trace) => ({
    id: trace.id,
    summary: `${trace.target} was already handled: ${trace.summary}`,
    reason: "Use this summary before repeating the same tool call unless the digest changed.",
    suggestion: "Reuse the previous summary if the target digest is unchanged.",
  }))
  const snapshot = {
    turn_id: input.turnId,
    session_id: input.sessionId,
    goal: {
      id: goalNode.id,
      title: goalNode.title,
      summary: goalNode.summary,
    },
    created_at: createdAt,
    token_budget: input.tokenBudget,
    selected_path: selectedPath,
    excluded,
    diff_from_previous_turn: diff,
    backtrack_candidates: backtrackCandidates,
  }
  await fs.writeFile(path.join(project, pathsRoot, `${input.turnId}.json`), JSON.stringify(snapshot, null, 2), "utf8")
  await fs.writeFile(path.join(project, pathsRoot, "latest.json"), JSON.stringify(snapshot, null, 2), "utf8")
  return snapshot
}

function updateLedger(ledger: string, trace: any) {
  const next = ensureLedgerTables(ledger)
  const digestValue = trace.input_digest ?? "sha256:unknown"
  if (trace.status === "failed" || trace.status === "error") {
    return upsertTableRow(next, "Failed Attempts", trace.id, [trace.id, trace.summary, trace.target])
  }
  if (trace.tool === "read") {
    return upsertTableRow(next, "Files Already Read", trace.target, [
      trace.target,
      trace.summary,
      trace.turn_id,
      digestValue,
    ])
  }
  if (trace.tool === "bash" || trace.tool === "shell") {
    return upsertTableRow(next, "Commands Already Run", trace.target, [
      trace.target,
      trace.status,
      trace.summary,
      trace.turn_id,
    ])
  }
  if (trace.tool === "edit" || trace.tool === "write" || trace.tool === "apply_patch") {
    return upsertTableRow(next, "Files Modified", trace.target, [trace.target, trace.summary, trace.turn_id])
  }
  return upsertTableRow(next, "Backtrack Anchors", trace.id, [
    trace.id,
    trace.target,
    "Preserves action-state continuity for future context reconstruction.",
  ])
}

function updateCurrentGoal(ledger: string, goal: string, turnId: string) {
  const next = ensureLedgerTables(ledger)
  const sectionStart = next.indexOf("## Current Goal")
  const nextSection = next.indexOf("\n## ", sectionStart + 1)
  const before = next.slice(0, sectionStart)
  const after = nextSection === -1 ? "" : next.slice(nextSection)
  return `${before}## Current Goal\n\n${goal || "current OpenCode task"} (${turnId})\n${after}`
}

function ensureLedgerTables(ledger: string) {
  if (ledger.includes("## Current Goal")) return ledger
  return ledgerMarkdown()
}

function upsertTableRow(markdown: string, section: string, key: string, cells: string[]) {
  const row = `| ${cells.map(escapeCell).join(" | ")} |`
  const sectionStart = markdown.indexOf(`## ${section}`)
  if (sectionStart === -1) return `${markdown}\n## ${section}\n\n${row}\n`
  const nextSection = markdown.indexOf("\n## ", sectionStart + 1)
  const before = markdown.slice(0, sectionStart)
  const body = markdown.slice(sectionStart, nextSection === -1 ? markdown.length : nextSection)
  const after = nextSection === -1 ? "" : markdown.slice(nextSection)
  const lines = body.split("\n").filter((line) => !line.startsWith(`| ${escapeCell(key)} |`))
  lines.push(row)
  return `${before}${lines.join("\n")}${after}`
}

function ledgerMarkdown() {
  return [
    "# Execution Ledger",
    "",
    "## Current Goal",
    "",
    "No active goal recorded yet.",
    "",
    "## Files Already Read",
    "",
    "| Path | Summary | Last Turn | Digest |",
    "|---|---|---|---|",
    "",
    "## Commands Already Run",
    "",
    "| Command | Status | Summary | Last Turn |",
    "|---|---|---|---|",
    "",
    "## Files Modified",
    "",
    "| Path | Summary | Last Turn |",
    "|---|---|---|",
    "",
    "## Failed Attempts",
    "",
    "| Attempt | Reason | Evidence |",
    "|---|---|---|",
    "",
    "## Backtrack Anchors",
    "",
    "| Anchor | Source | Why it matters |",
    "|---|---|---|",
    "",
  ].join("\n")
}

async function memoryMarkdown(project: string, node: (typeof seedMemoryNodes)[number]) {
  const updatedAt = new Date().toISOString()
  const details = typeof node.details === "function" ? await node.details(project) : node.details
  return [
    "---",
    `id: ${node.id}`,
    `type: ${node.type}`,
    `title: ${node.title}`,
    `summary: ${node.summary}`,
    "status: active",
    `updated_at: ${updatedAt}`,
    "---",
    "",
    `# ${node.title}`,
    "",
    "## Summary",
    "",
    node.summary,
    "",
    "## Details",
    "",
    details || "Initial memory seed. This section must be updated after the first real task execution.",
    "",
    "## Related Nodes",
    "",
    ...node.related.map((id) => `- ${id}`),
    "",
  ].join("\n")
}

async function indexMarkdown(project: string) {
  return [
    "# Memory Index",
    "",
    "## Memory Nodes",
    "",
    ...seedMemoryNodes.map((node) => `- \`${node.id}\` - ${node.summary}`),
    "",
    "## Workspace Files",
    "",
    ...(await scanProject(project)).map((file) => `- \`${file.path}\` - ${file.summary}`),
    "",
  ].join("\n")
}

function bootstrapSnapshot() {
  return {
    turn_id: "turn-0000",
    session_id: "session-default",
    goal: {
      id: "goal/session-default/turn-0000",
      title: "Bootstrap memory",
      summary: "Initial memory seed created by gomr init.",
    },
    created_at: new Date().toISOString(),
    selected_path: seedMemoryNodes.slice(0, 4).map((node, index) => ({
      id: node.id,
      type: node.type === "decision" ? "decision" : "memory",
      title: node.title,
      summary: node.summary,
      source: `.orca-memory/${node.path}`,
      reason: "Initial bootstrap context.",
      score: Number((1 - index * 0.05).toFixed(2)),
    })),
    excluded: [],
    diff_from_previous_turn: { added: [], removed: [], kept: [] },
    backtrack_candidates: [],
  }
}

async function writeGraphSeed(project: string) {
  const nodes = seedMemoryNodes.map((node) => ({
    id: node.id,
    type: node.type === "decision" ? "decision" : "memory",
    title: node.title,
    summary: node.summary,
    source: `.orca-memory/${node.path}`,
    status: "active",
    createdAt: new Date().toISOString(),
    tags: [node.type],
  }))
  const graph = { generated_at: new Date().toISOString(), nodes, edges: [], timeline: [] }
  await fs.writeFile(path.join(project, graphRoot, "nodes.json"), JSON.stringify(nodes, null, 2), "utf8")
  await fs.writeFile(path.join(project, graphRoot, "edges.json"), "[]\n", "utf8")
  await fs.writeFile(path.join(project, graphRoot, "timeline.json"), "[]\n", "utf8")
  await fs.writeFile(path.join(project, graphRoot, "graph-data.json"), JSON.stringify(graph, null, 2), "utf8")
}

async function readIndex(project: string) {
  return JSON.parse(await fs.readFile(path.join(project, memoryRoot, "index.json"), "utf8"))
}

async function readTraces(project: string) {
  const entries = await fs.readdir(path.join(project, traceRoot)).catch(() => [])
  const traces = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) =>
        fs
          .readFile(path.join(project, traceRoot, entry), "utf8")
          .then((text) => text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line))),
      ),
  )
  return traces.flat().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
}

async function readSnapshots(project: string) {
  const entries = await fs.readdir(path.join(project, pathsRoot)).catch(() => [])
  const snapshots = await Promise.all(
    entries
      .filter((entry) => entry.startsWith("turn-") && entry.endsWith(".json"))
      .map((entry) => fs.readFile(path.join(project, pathsRoot, entry), "utf8").then((text) => JSON.parse(text))),
  )
  return snapshots.sort((a, b) => a.turn_id.localeCompare(b.turn_id))
}

async function readLatestSnapshot(project: string) {
  return fs
    .readFile(path.join(project, pathsRoot, "latest.json"), "utf8")
    .then((text) => JSON.parse(text))
    .catch(() => bootstrapSnapshot())
}

async function nextTurnId(project: string) {
  const entries = await fs.readdir(path.join(project, pathsRoot)).catch(() => [])
  const max = entries
    .map((entry) => /^turn-(\d+)\.json$/.exec(entry)?.[1])
    .filter(Boolean)
    .map((value) => Number(value))
    .reduce((highest, value) => Math.max(highest, value), 0)
  return `turn-${String(max + 1).padStart(4, "0")}`
}

async function digestForTarget(project: string, target: string) {
  const absolute = path.resolve(project, target)
  if (!absolute.startsWith(path.resolve(project))) return digest(target)
  return fs
    .readFile(absolute)
    .then((buffer) => digest(buffer))
    .catch(() => digest(target))
}

function digest(value: string | Buffer) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

function evidenceForTarget(target: string) {
  return { path: target, line_start: 1, line_end: undefined }
}

function operationName(tool: string, target: string) {
  if (tool === "read") return "read_file"
  if (tool === "shell" || tool === "bash") return "run_command"
  if (tool === "edit" || tool === "write" || tool === "apply_patch") return "modify_file"
  return target === "unknown" ? "tool_execution" : `${tool}_execution`
}

function goalTerms(goal: string) {
  return goal
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((term) => term.length > 1)
}

function goalMatchScore(goal: string, text: string) {
  const terms = goalTerms(goal)
  if (terms.length === 0) return 0.5
  const haystack = text.toLowerCase()
  const hits = terms.filter((term) => haystack.includes(term)).length
  return Number(Math.min(1, 0.35 + hits / terms.length).toFixed(2))
}

function scoreBreakdown(goalHits: number, kind: string) {
  return {
    goal_match: Number(Math.min(0.35, goalHits * 0.12).toFixed(2)),
    state_continuity: kind === "trace" ? 0.2 : 0.12,
    freshness: 0.1,
    importance: kind === "memory" ? 0.15 : 0.1,
    dependency: kind === "source" ? 0.1 : 0.06,
    backtrack_value: kind === "trace" ? 0.1 : 0.04,
  }
}

function normalizeScore(score: number) {
  return Number(Math.min(0.95, Math.max(0.2, score / 20)).toFixed(2))
}

function titleFromGoal(goal: string) {
  const clean = goal.trim() || "Current OpenCode task"
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean
}

function fileKind(file: string) {
  if (file.startsWith("test/") || file.startsWith("tests/") || file.includes(".test.")) return "test"
  if (file.startsWith("src/") || file.endsWith(".ts") || file.endsWith(".js") || file.endsWith(".py") || file.endsWith(".go"))
    return "source"
  return "project"
}

function normalizeSessionId(sessionId?: string) {
  return slug(sessionId || "session-default")
}

function slug(value: string) {
  return normalizePath(value)
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

function normalizePath(file: string) {
  return file.replace(/\\/g, "/")
}

function escapeCell(value: string) {
  return String(value).replace(/\|/g, "/").replace(/\r?\n/g, " ").trim()
}

async function exists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false,
  )
}

async function writeFileIfMissing(file: string, content: string) {
  if (await exists(file)) return
  await fs.writeFile(file, content, "utf8")
}

function visualHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GOMR Context Path</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Segoe UI, Arial, sans-serif; background: #f6f7f8; color: #202124; }
    body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: 260px minmax(360px, 1fr) 320px; }
    aside, main, section { padding: 18px; overflow: auto; }
    aside { border-right: 1px solid #d9dde3; background: #ffffff; }
    section { border-left: 1px solid #d9dde3; background: #ffffff; }
    h1, h2 { margin: 0 0 14px; font-size: 18px; }
    h2 { font-size: 15px; color: #4b5563; }
    button.turn { display: block; width: 100%; border: 1px solid #d0d7de; background: #fff; border-radius: 6px; padding: 10px; margin: 0 0 8px; text-align: left; cursor: pointer; }
    button.turn.active { border-color: #0969da; background: #eaf3ff; }
    .node { border: 1px solid #d0d7de; background: #fff; border-radius: 6px; padding: 12px; margin: 0 0 10px; cursor: pointer; }
    .node.active { border-color: #0969da; box-shadow: 0 0 0 2px #dbeafe; }
    .type { display: inline-block; font-size: 12px; text-transform: uppercase; color: #57606a; margin-bottom: 6px; }
    .summary { color: #3f4650; line-height: 1.35; }
    .meta { color: #667085; font-size: 12px; overflow-wrap: anywhere; }
    .diff { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .diff div { border: 1px solid #d0d7de; border-radius: 6px; padding: 10px; background: #fff; min-height: 70px; }
    @media (max-width: 900px) { body { grid-template-columns: 1fr; } aside, section { border: 0; border-bottom: 1px solid #d9dde3; } }
  </style>
</head>
<body>
  <aside>
    <h1>Turn Timeline</h1>
    <div id="timeline"></div>
  </aside>
  <main>
    <h1>Path Graph</h1>
    <div id="path"></div>
    <h2>Turn Diff</h2>
    <div class="diff">
      <div><strong>Added nodes</strong><p id="added" class="meta"></p></div>
      <div><strong>Removed nodes</strong><p id="removed" class="meta"></p></div>
      <div><strong>Kept nodes</strong><p id="kept" class="meta"></p></div>
    </div>
  </main>
  <section>
    <h1>Node Detail</h1>
    <div id="detail" class="meta">Select a node.</div>
  </section>
  <script>
    let graph = { timeline: [], nodes: [], edges: [] };
    let latestTurn = "";
    let activeTurn = "";
    let activeNode = "";
    async function loadGraph() {
      graph = await fetch("graph-data.json?ts=" + Date.now()).then(r => r.json()).catch(() => graph);
      const latest = await fetch("../paths/latest.json?ts=" + Date.now()).then(r => r.json()).catch(() => null);
      if (latest && latest.turn_id !== latestTurn) {
        latestTurn = latest.turn_id;
        activeTurn = latest.turn_id;
      }
      render();
    }
    async function loadTurn(turnId) {
      activeTurn = turnId;
      const snapshot = await fetch("../paths/" + turnId + ".json?ts=" + Date.now()).then(r => r.json()).catch(() => null);
      render(snapshot);
    }
    async function render(snapshot) {
      const timeline = document.getElementById("timeline");
      timeline.innerHTML = graph.timeline.map(t => '<button class="turn ' + (t.turn_id === activeTurn ? 'active' : '') + '" onclick="loadTurn(\\'' + t.turn_id + '\\')"><strong>' + t.turn_id + '</strong><br>' + escapeHtml(t.title || '') + '</button>').join("");
      if (!snapshot && activeTurn) snapshot = await fetch("../paths/" + activeTurn + ".json?ts=" + Date.now()).then(r => r.json()).catch(() => null);
      if (!snapshot) return;
      const path = document.getElementById("path");
      path.innerHTML = snapshot.selected_path.map(n => '<article class="node ' + (n.id === activeNode ? 'active' : '') + '" onclick="selectNode(\\'' + n.id.replace(/'/g, "\\\\'") + '\\')"><span class="type">' + escapeHtml(n.type) + '</span><h2>' + escapeHtml(n.title) + '</h2><p class="summary">' + escapeHtml(n.summary) + '</p><p class="meta">Reason: ' + escapeHtml(n.reason || '') + '<br>Score: ' + (n.score ?? '') + '<br>Source: ' + escapeHtml(n.source || '') + '</p></article>').join("");
      document.getElementById("added").textContent = (snapshot.diff_from_previous_turn.added || []).join("\\n");
      document.getElementById("removed").textContent = (snapshot.diff_from_previous_turn.removed || []).join("\\n");
      document.getElementById("kept").textContent = (snapshot.diff_from_previous_turn.kept || []).join("\\n");
    }
    async function selectNode(id) {
      activeNode = id;
      const snapshot = await fetch("../paths/" + activeTurn + ".json?ts=" + Date.now()).then(r => r.json()).catch(() => null);
      const node = snapshot?.selected_path.find(n => n.id === id);
      const related = graph.edges.filter(e => e.from === id || e.to === id);
      document.getElementById("detail").innerHTML = node ? '<h2>' + escapeHtml(node.title) + '</h2><p>' + escapeHtml(node.summary) + '</p><p>id: ' + escapeHtml(node.id) + '<br>type: ' + escapeHtml(node.type) + '<br>source: ' + escapeHtml(node.source || '') + '<br>reason: ' + escapeHtml(node.reason || '') + '<br>score: ' + (node.score ?? '') + '</p><p>related edges: ' + related.length + '</p>' : 'Select a node.';
      render(snapshot);
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    loadGraph();
    setInterval(loadGraph, 1500);
  </script>
</body>
</html>`
}
