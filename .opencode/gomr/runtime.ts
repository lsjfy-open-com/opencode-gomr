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
  const visualData = await buildVisualData(project, graph)
  await fs.writeFile(path.join(project, visualRoot, "graph-data.json"), JSON.stringify(visualData, null, 2), "utf8")
  await fs.writeFile(path.join(project, visualRoot, "index.html"), visualHtml(visualData), "utf8")
}

async function buildVisualData(project: string, graph: { nodes: any[]; edges: any[]; timeline: any[] }) {
  const snapshots = await readSnapshots(project)
  const traces = await readTraces(project)
  const traceById = new Map(traces.map((trace) => [trace.id, trace]))
  const latestSnapshot = snapshots.at(-1)
  const nodeReasons = new Map<string, string>()
  const nodeRelations = new Map<string, Set<string>>()

  for (const snapshot of snapshots) {
    for (const node of snapshot.selected_path ?? []) {
      nodeReasons.set(node.id, node.reason || "Selected for the reconstructed context path.")
      addRelation(nodeRelations, node.id, `selected_for_goal: ${snapshot.goal.title}`)
    }
    for (const node of snapshot.excluded ?? []) {
      nodeReasons.set(node.id, node.reason || "Excluded from this turn's rebuilt context.")
      addRelation(nodeRelations, node.id, `excluded_by: ${snapshot.goal.title}`)
    }
    for (const candidate of snapshot.backtrack_candidates ?? []) {
      addRelation(nodeRelations, candidate.id, "reuse candidate: previous tool evidence can be used before repeating work")
    }
  }

  const nodesById = new Map<string, any>()
  for (const node of graph.nodes) {
    const trace = traceById.get(node.id)
    nodesById.set(node.id, visualNodeFromGraphNode(node, trace, nodeReasons, nodeRelations))
  }

  for (const snapshot of snapshots) {
    nodesById.set(snapshot.goal.id, visualNodeFromSnapshotNode(snapshot.goal.id, "goal", snapshot.goal.title, snapshot.goal.summary, "user goal", 1))
    for (const node of [...(snapshot.selected_path ?? []), ...(snapshot.excluded ?? [])]) {
      if (!nodesById.has(node.id)) {
        nodesById.set(node.id, visualNodeFromSnapshotNode(node.id, node.type, node.title, node.summary, node.source, node.score, node.reason))
      }
    }
    for (const candidate of snapshot.backtrack_candidates ?? []) {
      if (!nodesById.has(candidate.id)) {
        nodesById.set(
          candidate.id,
          visualNodeFromSnapshotNode(candidate.id, "trace", "Backtrack Anchor", candidate.summary, "path snapshot", 0.72, candidate.reason),
        )
      }
    }
  }

  const ledgerText = await fs.readFile(path.join(project, cacheRoot, "execution-ledger.md"), "utf8").catch(() => "")
  nodesById.set("ledger/execution", {
    id: "ledger/execution",
    type: "ledger",
    title: "Execution Ledger",
    summary: "Tracks files read, commands run, files modified, failures, current goal, and backtrack anchors.",
    source: ".orca-memory/cache/execution-ledger.md",
    reason: "Preserves action-state continuity across turns.",
    score: 0.92,
    relations: ["summarizes traces", "precondition_for next context reconstruction"],
    metadata: { status: ledgerText.length > 0 ? "active" : "empty" },
  })

  const turns = snapshots.map((snapshot, index) => {
    const pathIds = (snapshot.selected_path ?? []).map((node) => node.id)
    const excludedIds = (snapshot.excluded ?? []).map((node) => node.id)
    const reusedAnchors = [
      ...new Set([
        ...(snapshot.backtrack_candidates ?? []).map((candidate) => candidate.id),
        ...pathIds.filter((id) => id.startsWith("trace/") || id.startsWith("path/") || id.startsWith("ledger/")),
      ]),
    ]
    const rawContextTokens = estimateRawContextTokens(index, traces.length, ledgerText)
    const rebuiltContextTokens = estimateRebuiltContextTokens(snapshot)
    const newNodes = snapshot.diff_from_previous_turn?.added ?? pathIds
    return {
      id: snapshot.turn_id,
      title: snapshot.goal.title || snapshot.turn_id,
      time: snapshot.created_at,
      goal: snapshot.goal.summary || snapshot.goal.title,
      rawContextTokens,
      rebuiltContextTokens,
      reusedAnchors,
      anchors: reusedAnchors,
      newNodes,
      path: pathIds,
      excluded: excludedIds,
      relationNotes: relationNotesForTurn(snapshot),
      contextBlocks: contextBlocksForSnapshot(snapshot, ledgerText),
    }
  })

  const positionedNodes = assignVisualPositions([...nodesById.values()])
  const visualEdges = graph.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
    summary: edge.summary || edge.type,
    weight: edge.weight,
    turnId: edge.turnId,
  }))
  if (latestSnapshot) {
    for (const excluded of latestSnapshot.excluded ?? []) {
      visualEdges.push({
        from: latestSnapshot.goal.id,
        to: excluded.id,
        type: "excluded_by",
        summary: excluded.reason || "Excluded from the current rebuilt path.",
        weight: 0.2,
        turnId: latestSnapshot.turn_id,
      })
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    turns,
    nodes: positionedNodes,
    edges: visualEdges,
  }
}

function visualNodeFromGraphNode(
  node: any,
  trace: any | undefined,
  reasons: Map<string, string>,
  relations: Map<string, Set<string>>,
) {
  return {
    id: node.id,
    type: visualNodeType(node.type),
    title: node.title || node.id,
    summary: node.summary || fallbackSummary(node),
    source: node.source || "graph data",
    reason: reasons.get(node.id) || "Global context node available for reconstruction.",
    score: typeof node.score === "number" ? node.score : 0.5,
    relations: [...(relations.get(node.id) ?? new Set(node.tags ?? []))],
    metadata: trace
      ? {
          tool: trace.tool,
          target: trace.target,
          operation: trace.operation,
          status: trace.status,
          inputDigest: trace.input_digest,
          outputDigest: trace.output_digest,
          evidencePath: trace.evidence?.path,
          lineStart: trace.evidence?.line_start,
          lineEnd: trace.evidence?.line_end,
          digestChanged: false,
        }
      : { status: node.status },
  }
}

function visualNodeFromSnapshotNode(
  id: string,
  type: string,
  title: string,
  summary: string,
  source: string | undefined,
  score = 0.5,
  reason = "Selected by context reconstruction.",
) {
  return {
    id,
    type: visualNodeType(type),
    title: title || id,
    summary: summary || "Context node summary generated during visual export.",
    source: source || "path snapshot",
    reason,
    score,
    relations: ["derived_from path snapshot"],
    metadata: {},
  }
}

function visualNodeType(type: string) {
  if (type === "workspace") return "file"
  if (type === "project") return "file"
  if (["goal", "memory", "trace", "ledger", "decision", "file", "path", "raw", "command", "error"].includes(type)) return type
  return "file"
}

function fallbackSummary(node: any) {
  if (node.source) return `Context node from ${node.source}.`
  return "Context node retained in the global GOMR graph."
}

function addRelation(relations: Map<string, Set<string>>, id: string, relation: string) {
  if (!relations.has(id)) relations.set(id, new Set())
  relations.get(id)?.add(relation)
}

function estimateRawContextTokens(index: number, traceCount: number, ledgerText: string) {
  return 6000 + index * 4200 + traceCount * 700 + Math.ceil(ledgerText.length / 4)
}

function estimateRebuiltContextTokens(snapshot: any) {
  const selectedText = (snapshot.selected_path ?? []).map((node) => `${node.title} ${node.summary} ${node.reason ?? ""}`).join("\n")
  const backtrackText = (snapshot.backtrack_candidates ?? []).map((candidate) => `${candidate.summary} ${candidate.reason}`).join("\n")
  return Math.max(1200, Math.ceil((selectedText.length + backtrackText.length) / 3) + (snapshot.selected_path?.length ?? 0) * 260)
}

function relationNotesForTurn(snapshot: any) {
  const notes = (snapshot.selected_path ?? [])
    .slice(0, 4)
    .map((node) => `${node.title}: ${node.reason || "selected for this goal"}`)
  for (const candidate of snapshot.backtrack_candidates ?? []) {
    notes.push(`${candidate.id}: ${candidate.reason}`)
  }
  return notes.slice(0, 6)
}

function contextBlocksForSnapshot(snapshot: any, ledgerText: string) {
  const used = (snapshot.selected_path ?? []).slice(0, 8).map((node) => ({
    id: `used/${node.id}`,
    title: node.title,
    summary: node.summary,
    sourceType: blockSourceType(node.type),
    usedInRebuiltContext: true,
    used: true,
    reason: node.reason || "Included in the rebuilt context path.",
  }))
  const unused = [
    {
      id: `raw/${snapshot.turn_id}/full-history`,
      title: "Raw accumulated history",
      summary: "Full local history is retained as evidence but is not injected wholesale into the model context.",
      sourceType: "raw_conversation",
      usedInRebuiltContext: false,
      used: false,
      reason: "Replaced by selected memory, trace, ledger, and path summaries.",
    },
    ...((snapshot.excluded ?? []).slice(0, 5).map((node) => ({
      id: `excluded/${node.id}`,
      title: node.title,
      summary: node.summary,
      sourceType: blockSourceType(node.type),
      usedInRebuiltContext: false,
      used: false,
      reason: node.reason || "Excluded from this turn's rebuilt context.",
    })) as any[]),
  ]
  if (ledgerText) {
    used.push({
      id: `used/${snapshot.turn_id}/ledger`,
      title: "Execution Ledger",
      summary: "Compact action state from previous files, commands, failures, and anchors.",
      sourceType: "ledger",
      usedInRebuiltContext: true,
      used: true,
      reason: "Ledger gives continuity without reloading raw conversation history.",
    })
  }
  return [...used, ...unused]
}

function blockSourceType(type: string) {
  if (type === "trace") return "trace"
  if (type === "memory") return "memory"
  if (type === "decision") return "decision"
  if (type === "path") return "path_snapshot"
  return "raw_tool_output"
}

function assignVisualPositions(nodes: any[]) {
  const lanes = {
    goal: 40,
    memory: 300,
    decision: 560,
    file: 820,
    trace: 1080,
    command: 1080,
    error: 1080,
    ledger: 1340,
    path: 1340,
    raw: 1600,
  } as Record<string, number>
  const counts = new Map<string, number>()
  return nodes.map((node) => {
    const type = visualNodeType(node.type)
    const count = counts.get(type) ?? 0
    counts.set(type, count + 1)
    return {
      ...node,
      type,
      x: node.x ?? lanes[type] ?? 820,
      y: node.y ?? 50 + count * 140,
    }
  })
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

function visualHtml(data: any) {
  const embedded = JSON.stringify(data).replace(/</g, "\\u003c")
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GOMR Context Reconstruction Visualization</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1020; --panel:#11182c; --panel2:#151e36; --card:#17213d; --line:#2b385f; --text:#edf3ff; --muted:#8ea0c5; --accent:#7cc7ff; --selected:#4db5ff; --green:#8ef0b0; --yellow:#ffd36e; --excluded:#4a5168; --purple:#caa7ff; --shadow:0 14px 40px rgba(0,0,0,.35); font-family: Inter, "Segoe UI", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin:0; background: radial-gradient(circle at top left, #172a55, var(--bg) 38%), var(--bg); color:var(--text); font:14px/1.45 Inter, "Segoe UI", system-ui, sans-serif; }
    header { padding:18px 24px 12px; border-bottom:1px solid var(--line); background:rgba(11,16,32,.84); position:sticky; top:0; z-index:5; backdrop-filter:blur(12px); }
    header h1 { margin:0 0 6px; font-size:20px; }
    header p { margin:0; color:var(--muted); }
    .layout { display:grid; grid-template-columns:300px minmax(520px,1fr) 360px; gap:14px; padding:14px; min-height:calc(100vh - 74px); }
    .panel { background:linear-gradient(180deg, rgba(21,30,54,.96), rgba(14,20,37,.98)); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden; min-width:0; }
    .panel h2 { font-size:14px; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); margin:0; padding:14px 16px; border-bottom:1px solid var(--line); background:rgba(255,255,255,.02); }
    .controls { display:flex; gap:8px; padding:12px; border-bottom:1px solid var(--line); }
    button { border:1px solid var(--line); color:var(--text); background:var(--card); padding:8px 12px; border-radius:999px; cursor:pointer; }
    button:hover { border-color:var(--accent); }
    .turn-list { padding:12px; display:grid; gap:10px; overflow:auto; max-height:calc(100vh - 168px); }
    .turn { border:1px solid var(--line); border-radius:14px; padding:12px; background:var(--card); cursor:pointer; transition:.18s; }
    .turn:hover { border-color:var(--accent); transform:translateY(-1px); }
    .turn.active { border-color:var(--selected); box-shadow:0 0 0 2px rgba(77,181,255,.16) inset; }
    .turn-title { font-weight:700; margin-bottom:4px; }
    .turn-meta { color:var(--muted); font-size:12px; }
    .badge-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
    .badge { border-radius:999px; padding:3px 8px; background:rgba(124,199,255,.13); color:#cfeeff; font-size:11px; border:1px solid rgba(124,199,255,.26); }
    .main { display:grid; grid-template-rows:auto auto 1fr; gap:14px; min-width:0; }
    .summary-grid { display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr; gap:10px; padding:12px; }
    .metric { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px; min-width:0; }
    .metric .label { color:var(--muted); font-size:12px; }
    .metric .value { font-size:20px; font-weight:800; margin-top:4px; overflow-wrap:anywhere; }
    .metric .hint { color:var(--muted); font-size:12px; margin-top:6px; }
    .legend { display:flex; flex-wrap:wrap; gap:10px; padding:0 12px 12px; color:var(--muted); font-size:12px; }
    .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:5px; }
    .tabs { display:flex; gap:8px; padding:12px; border-bottom:1px solid var(--line); overflow:auto; }
    .tab.active { border-color:var(--accent); background:rgba(124,199,255,.15); }
    .canvas { padding:16px; overflow:auto; min-height:430px; }
    .graph-stage { position:relative; width:1810px; height:760px; background:linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px); background-size:34px 34px; border-radius:14px; border:1px solid rgba(255,255,255,.06); }
    svg.edges { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
    .node { position:absolute; width:190px; min-height:88px; padding:10px; border-radius:14px; border:1px solid var(--line); background:rgba(23,33,61,.96); box-shadow:0 8px 24px rgba(0,0,0,.25); cursor:pointer; transition:.18s; overflow:hidden; }
    .node.path { border-color:var(--selected); box-shadow:0 0 0 2px rgba(77,181,255,.14) inset, 0 8px 24px rgba(0,0,0,.25); }
    .node.anchor { border-color:var(--green); }
    .node.dimmed { opacity:.35; filter:grayscale(.4); }
    .node.excluded { border-color:var(--excluded); opacity:.55; }
    .node.selected { transform:scale(1.03); border-color:var(--yellow); z-index:2; }
    .node .kind { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
    .node .title { font-weight:800; margin:4px 0; }
    .node .summary { color:#cbd7f6; font-size:12px; max-height:48px; overflow:hidden; }
    .score { margin-top:8px; height:6px; background:rgba(255,255,255,.08); border-radius:999px; overflow:hidden; }
    .score span { display:block; height:100%; background:linear-gradient(90deg,var(--accent),var(--green)); }
    .tree { display:grid; gap:8px; }
    .tree-row { display:grid; grid-template-columns:220px 1fr 110px; gap:10px; align-items:start; padding:10px; border:1px solid var(--line); border-radius:12px; background:rgba(23,33,61,.7); cursor:pointer; }
    .tree-row.active { border-color:var(--selected); background:rgba(77,181,255,.10); }
    .tree-row.excluded { opacity:.55; }
    .tree-name { font-weight:700; }
    .tree-desc, .tree-reason { color:var(--muted); font-size:12px; }
    .compare { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .stream, .reconstructed { border:1px solid var(--line); border-radius:14px; padding:12px; background:var(--card); }
    .stream h3, .reconstructed h3 { margin:0 0 10px; font-size:14px; }
    .block { border-left:3px solid var(--line); padding:8px 10px; margin:8px 0; background:rgba(255,255,255,.03); color:#d9e5ff; border-radius:0 10px 10px 0; }
    .block.used { border-left-color:var(--selected); background:rgba(77,181,255,.10); }
    .block.skipped { opacity:.48; }
    .small, .meta { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
    .detail { padding:14px; overflow:auto; max-height:calc(100vh - 120px); }
    .detail-card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px; margin-bottom:12px; }
    .detail-card h3 { margin:0 0 8px; font-size:15px; }
    .kv { display:grid; grid-template-columns:96px 1fr; gap:8px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.05); }
    .kv:last-child { border-bottom:none; }
    .kv .k { color:var(--muted); }
    .chip { display:inline-flex; margin:4px 4px 0 0; padding:4px 8px; border:1px solid rgba(124,199,255,.25); border-radius:999px; color:#d8ecff; background:rgba(124,199,255,.09); font-size:12px; }
    .diff { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:14px; }
    .diff div { border:1px solid var(--line); border-radius:12px; padding:10px; background:var(--card); min-height:70px; }
    @media (max-width:1100px) { .layout { grid-template-columns:1fr; } .summary-grid, .compare { grid-template-columns:1fr; } .detail { max-height:none; } }
  </style>
</head>
<body>
  <header>
    <h1>GOMR Context Reconstruction Visualization</h1>
    <p>目标驱动上下文路径解释器：全局历史本地留存，本轮目标点亮最小充分路径。</p>
  </header>
  <div class="layout">
    <aside class="panel">
      <h2>Turn Timeline</h2>
      <div class="controls"><button id="playBtn">自动播放</button><button id="latestBtn">最新轮</button></div>
      <div id="timeline" class="turn-list"></div>
    </aside>
    <main class="main">
      <section class="panel">
        <div id="metrics" class="summary-grid"></div>
        <div class="legend">
          <span><i class="dot" style="background:var(--selected)"></i>被点亮路径</span>
          <span><i class="dot" style="background:var(--excluded)"></i>本轮排除</span>
          <span><i class="dot" style="background:var(--green)"></i>复用历史锚点</span>
          <span><i class="dot" style="background:var(--yellow)"></i>当前选中节点</span>
        </div>
      </section>
      <section class="panel">
        <div class="tabs">
          <button class="tab active" data-view="graph">图路径：全局节点中点亮本轮路径</button>
          <button class="tab" data-view="tree">树视图：路径节点展开</button>
          <button class="tab" data-view="compare">对比：不重构 vs 重构后 Context</button>
        </div>
        <div id="viewContainer" class="canvas"></div>
      </section>
    </main>
    <section class="panel">
      <h2>Node Detail</h2>
      <div id="detail" class="detail">Select a node.</div>
    </section>
  </div>
  <script>
    const embeddedData = ${embedded};
    let graph = embeddedData;
    let latestTurn = graph.turns && graph.turns.length ? graph.turns[graph.turns.length - 1].id : "";
    let activeTurn = latestTurn;
    let activeNode = "";
    let currentView = "graph";
    let timer = null;

    function byId(id) { return (graph.nodes || []).find(function(node) { return node.id === id; }); }
    function turn() { return (graph.turns || []).find(function(item) { return item.id === activeTurn; }) || (graph.turns || [])[0]; }

    async function loadGraph() {
      graph = await fetch("graph-data.json?ts=" + Date.now()).then(function(r) { return r.json(); }).catch(function() { return graph; });
      const latest = await fetch("../paths/latest.json?ts=" + Date.now()).then(function(r) { return r.json(); }).catch(function() { return null; });
      if (latest && latest.turn_id !== latestTurn) {
        latestTurn = latest.turn_id;
        activeTurn = latest.turn_id;
      }
      render();
    }

    function renderTurns() {
      const timeline = document.getElementById("timeline");
      timeline.innerHTML = (graph.turns || []).map(function(t) {
        return '<div class="turn ' + (t.id === activeTurn ? 'active' : '') + '" onclick="selectTurn(\\'' + escAttr(t.id) + '\\')">' +
          '<div class="turn-title">' + escapeHtml(t.id) + ' · ' + escapeHtml(t.title) + '</div>' +
          '<div class="turn-meta">' + escapeHtml(t.time || '') + ' · ' + escapeHtml(t.goal || '') + '</div>' +
          '<div class="badge-row"><span class="badge">raw ' + Number(t.rawContextTokens || 0).toLocaleString() + ' tok</span>' +
          '<span class="badge">rebuilt ' + Number(t.rebuiltContextTokens || 0).toLocaleString() + ' tok</span>' +
          '<span class="badge">' + (t.reusedAnchors || []).length + ' anchors</span></div></div>';
      }).join("");
    }

    function renderMetrics() {
      const t = turn();
      if (!t) return;
      const reduction = Math.max(0, Math.round((1 - (t.rebuiltContextTokens || 0) / Math.max(1, t.rawContextTokens || 1)) * 100));
      document.getElementById("metrics").innerHTML =
        '<div class="metric"><div class="label">当前目标</div><div class="value">' + escapeHtml(t.goal) + '</div><div class="hint">Current Goal</div></div>' +
        '<div class="metric"><div class="label">Context 重构减少</div><div class="value">' + reduction + '%</div><div class="hint">raw vs rebuilt</div></div>' +
        '<div class="metric"><div class="label">复用历史锚点</div><div class="value">' + (t.reusedAnchors || []).length + '</div><div class="hint">trace / ledger / path</div></div>' +
        '<div class="metric"><div class="label">新增路径节点</div><div class="value">' + (t.newNodes || []).length + '</div><div class="hint">Added nodes</div></div>';
    }

    function renderGraph() {
      const t = turn();
      if (!t) return;
      const pathSet = new Set(t.path || []);
      const excludedSet = new Set(t.excluded || []);
      const anchorSet = new Set(t.reusedAnchors || t.anchors || []);
      const edgeSvg = '<svg class="edges" viewBox="0 0 1810 760"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#52628a"></path></marker><marker id="arrowPath" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4db5ff"></path></marker></defs>' +
        (graph.edges || []).map(function(edge) {
          const a = byId(edge.from), b = byId(edge.to);
          if (!a || !b) return "";
          const active = pathSet.has(edge.from) && pathSet.has(edge.to);
          const color = active ? "#4db5ff" : edge.type === "excluded_by" ? "#4a5168" : "#52628a";
          const width = active ? 2.5 : 1.2;
          const opacity = active ? .95 : .28;
          const marker = active ? "arrowPath" : "arrow";
          return '<line x1="' + (a.x + 95) + '" y1="' + (a.y + 44) + '" x2="' + (b.x + 95) + '" y2="' + (b.y + 44) + '" stroke="' + color + '" stroke-width="' + width + '" opacity="' + opacity + '" marker-end="url(#' + marker + ')"><title>' + escapeHtml(edge.summary || edge.type) + '</title></line>';
        }).join("") + '</svg>';
      const nodes = (graph.nodes || []).map(function(n) {
        const active = pathSet.has(n.id);
        const excluded = excludedSet.has(n.id);
        const anchor = anchorSet.has(n.id);
        const dim = !active && !excluded;
        const cls = 'node ' + (active ? 'path ' : '') + (excluded ? 'excluded ' : '') + (anchor ? 'anchor ' : '') + (dim ? 'dimmed ' : '') + (activeNode === n.id ? 'selected' : '');
        return '<div class="' + cls + '" style="left:' + (n.x || 0) + 'px;top:' + (n.y || 0) + 'px" onclick="selectNode(\\'' + escAttr(n.id) + '\\')">' +
          '<div class="kind">' + escapeHtml(n.type) + (anchor ? ' · reused anchor' : '') + '</div>' +
          '<div class="title">' + escapeHtml(n.title) + '</div><div class="summary">' + escapeHtml(n.summary) + '</div>' +
          '<div class="score"><span style="width:' + Math.round((n.score || 0) * 100) + '%"></span></div></div>';
      }).join("");
      document.getElementById("viewContainer").innerHTML = '<h2 style="position:absolute;left:-9999px">Path Graph</h2><div class="graph-stage">' + edgeSvg + nodes + '</div>' + renderDiff(t);
    }

    function renderTree() {
      const t = turn();
      if (!t) return;
      const rows = (t.path || []).map(function(id, index) {
        const n = byId(id);
        if (!n) return "";
        const anchor = (t.reusedAnchors || []).includes(id);
        return '<div class="tree-row active" onclick="selectNode(\\'' + escAttr(id) + '\\')"><div><div class="tree-name">' + (index + 1) + '. ' + escapeHtml(n.title) + '</div><div class="tree-desc">' + escapeHtml(n.type) + ' · ' + escapeHtml(n.source || '') + '</div></div><div><div>' + escapeHtml(n.summary) + '</div><div class="tree-reason">选中原因：' + escapeHtml(n.reason || '') + '</div><div class="tree-reason">与目标关系：' + escapeHtml((n.relations || []).join('；')) + '</div></div><div><span class="badge">' + Math.round((n.score || 0) * 100) + '%</span>' + (anchor ? '<span class="badge" style="color:#caffd7">复用锚点</span>' : '') + '</div></div>';
      }).join("");
      const excludedRows = (t.excluded || []).map(function(id) {
        const n = byId(id);
        if (!n) return "";
        return '<div class="tree-row excluded" onclick="selectNode(\\'' + escAttr(id) + '\\')"><div><div class="tree-name">排除 · ' + escapeHtml(n.title) + '</div><div class="tree-desc">' + escapeHtml(n.type) + '</div></div><div><div>' + escapeHtml(n.summary) + '</div><div class="tree-reason">排除原因：' + escapeHtml(n.reason || '') + '</div></div><div><span class="badge">' + Math.round((n.score || 0) * 100) + '%</span></div></div>';
      }).join("");
      document.getElementById("viewContainer").innerHTML = '<div class="tree"><h3>本轮重构出的前置路径</h3>' + rows + '<h3 style="margin-top:18px;color:var(--muted)">本轮明确排除的历史节点</h3>' + excludedRows + '</div>' + renderDiff(t);
    }

    function renderCompare() {
      const t = turn();
      if (!t) return;
      const rawBlocks = (t.contextBlocks || []).map(function(block) {
        return '<div class="block ' + (block.usedInRebuiltContext ? 'used' : 'skipped') + '"><strong>' + escapeHtml(block.title) + '</strong><div class="small">' + escapeHtml(block.summary || block.reason) + '</div><div class="small">' + escapeHtml(block.reason || '') + '</div></div>';
      }).join("");
      const rebuilt = (t.path || []).map(function(id) {
        const n = byId(id);
        if (!n) return "";
        return '<div class="block used"><strong>' + escapeHtml(n.title) + '</strong><div class="small">' + escapeHtml(n.summary) + '</div><div class="small">关系：' + escapeHtml((n.relations || []).join('；') || n.reason || '') + '</div></div>';
      }).join("");
      document.getElementById("viewContainer").innerHTML = '<div class="compare"><div class="stream"><h3>不重构：持续全量增加的历史文本流</h3><p class="small">历史本地保留，但不直接全量注入模型。</p>' + rawBlocks + '</div><div class="reconstructed"><h3>GOMR 重构后：点亮目标相关路径</h3><p class="small">模型上下文由当前目标、memory、trace、ledger 和 path snapshot 重构。</p>' + rebuilt + '</div></div>' + renderDiff(t);
    }

    function renderDiff(t) {
      return '<div class="diff"><div><strong>Added nodes</strong><p class="meta">' + escapeHtml((t.newNodes || []).join('\\n')) + '</p></div><div><strong>Removed nodes</strong><p class="meta">' + escapeHtml((t.removedNodes || []).join('\\n')) + '</p></div><div><strong>Kept nodes</strong><p class="meta">' + escapeHtml((t.keptNodes || []).join('\\n')) + '</p></div></div>';
    }

    function renderDetail() {
      const t = turn();
      if (!t) return;
      const n = byId(activeNode || (t.path || [])[0]);
      if (!n) return;
      activeNode = n.id;
      const inPath = (t.path || []).includes(n.id);
      const isAnchor = (t.reusedAnchors || []).includes(n.id);
      const isExcluded = (t.excluded || []).includes(n.id);
      const metadata = n.metadata || {};
      document.getElementById("detail").innerHTML =
        '<div class="detail-card"><h3>' + escapeHtml(n.title) + '</h3>' +
        '<div class="kv"><div class="k">id</div><div>' + escapeHtml(n.id) + '</div></div>' +
        '<div class="kv"><div class="k">类型</div><div>' + escapeHtml(n.type) + '</div></div>' +
        '<div class="kv"><div class="k">来源</div><div>' + escapeHtml(n.source || '') + '</div></div>' +
        '<div class="kv"><div class="k">分数</div><div>' + Math.round((n.score || 0) * 100) + '%</div></div>' +
        '<div class="kv"><div class="k">状态</div><div>' + (inPath ? '本轮路径节点' : isExcluded ? '本轮排除' : '全局存在，当前未点亮') + (isAnchor ? ' · 复用锚点' : '') + '</div></div></div>' +
        '<div class="detail-card"><h3>摘要与依据</h3><p>' + escapeHtml(n.summary) + '</p><p class="small">' + escapeHtml(n.reason || '') + '</p>' + (n.relations || []).map(function(r) { return '<span class="chip">' + escapeHtml(r) + '</span>'; }).join("") + '</div>' +
        '<div class="detail-card"><h3>Trace / Memory Metadata</h3>' +
        Object.keys(metadata).map(function(key) { return '<div class="kv"><div class="k">' + escapeHtml(key) + '</div><div>' + escapeHtml(metadata[key]) + '</div></div>'; }).join("") + '</div>' +
        '<div class="detail-card"><h3>本轮强相关关系</h3>' + (t.relationNotes || []).map(function(note) { return '<span class="chip">' + escapeHtml(note) + '</span>'; }).join("") + '</div>' +
        '<div class="detail-card"><h3>本轮复用锚点</h3>' + (t.reusedAnchors || []).map(function(id) { const anchor = byId(id); return '<span class="chip">' + escapeHtml(anchor ? anchor.title : id) + '</span>'; }).join("") + '</div>';
    }

    function render() {
      renderTurns();
      renderMetrics();
      if (currentView === "graph") renderGraph();
      if (currentView === "tree") renderTree();
      if (currentView === "compare") renderCompare();
      renderDetail();
    }

    function selectTurn(id) {
      activeTurn = id;
      const t = turn();
      activeNode = t && t.path ? t.path[0] : "";
      render();
    }

    function selectNode(id) {
      activeNode = id;
      render();
    }

    document.querySelectorAll(".tab").forEach(function(button) {
      button.addEventListener("click", function() {
        document.querySelectorAll(".tab").forEach(function(tab) { tab.classList.remove("active"); });
        button.classList.add("active");
        currentView = button.dataset.view;
        render();
      });
    });
    document.getElementById("latestBtn").onclick = function() { selectTurn(latestTurn || ((graph.turns || []).at(-1) || {}).id); };
    document.getElementById("playBtn").onclick = function() {
      if (timer) { clearInterval(timer); timer = null; document.getElementById("playBtn").textContent = "自动播放"; return; }
      document.getElementById("playBtn").textContent = "停止播放";
      timer = setInterval(function() {
        const turns = graph.turns || [];
        const index = turns.findIndex(function(item) { return item.id === activeTurn; });
        if (turns.length) selectTurn(turns[(index + 1) % turns.length].id);
      }, 1800);
    };
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function escAttr(value) { return String(value).replace(/\\\\/g, "\\\\\\\\").replace(/'/g, "\\\\'"); }
    loadGraph();
    setInterval(loadGraph, 1500);
  </script>
</body>
</html>`
}
