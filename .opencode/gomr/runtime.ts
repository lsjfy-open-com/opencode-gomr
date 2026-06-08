import fs from "node:fs/promises"
import path from "node:path"

const memoryRoot = ".orca-memory"
const cacheRoot = path.join(memoryRoot, "cache")
const ignoredDirs = new Set([".git", "node_modules", ".orca-memory", "dist", "build", ".next", ".turbo"])
const rootFiles = new Set(["README.md", "package.json", "pyproject.toml", "go.mod", "AGENTS.md"])
const sourceDirs = new Set(["src", "test", "tests", "packages"])

export async function initMemory(project: string) {
  await Promise.all(
    [
      memoryRoot,
      path.join(memoryRoot, "modules"),
      path.join(memoryRoot, "decisions"),
      path.join(memoryRoot, "tasks"),
      path.join(memoryRoot, "sessions"),
      path.join(memoryRoot, "pitfalls"),
      cacheRoot,
      path.join(memoryRoot, "archive"),
    ].map((dir) => fs.mkdir(path.join(project, dir), { recursive: true })),
  )
  await Promise.all([
    fs.writeFile(path.join(project, memoryRoot, "profile.md"), profileMarkdown(project), "utf8"),
    fs.writeFile(path.join(project, memoryRoot, "architecture.md"), await architectureMarkdown(project), "utf8"),
    fs.writeFile(path.join(project, memoryRoot, "goals.md"), goalsMarkdown(), "utf8"),
    fs.writeFile(path.join(project, cacheRoot, "execution-ledger.md"), ledgerMarkdown(), "utf8"),
    fs.writeFile(path.join(project, cacheRoot, "tool-trace.jsonl"), "", "utf8"),
  ])
  await fs.writeFile(
    path.join(project, memoryRoot, "index.json"),
    JSON.stringify(
      {
        version: 1,
        generated_at: new Date().toISOString(),
        project_root: project,
        files: await scanProject(project),
      },
      null,
      2,
    ),
    "utf8",
  )
  await fs.writeFile(path.join(project, memoryRoot, "index.md"), await indexMarkdown(project), "utf8")
}

export async function contextPlan(project: string, goal: string) {
  await ensureMemory(project)
  const terms = goal
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((term) => term.length > 1)
  const index = await readIndex(project)
  return {
    goal,
    memory: [
      ".orca-memory/profile.md",
      ".orca-memory/architecture.md",
      ".orca-memory/goals.md",
      ...scoreFiles(index.files, terms).slice(0, 6).map((file) => `.orca-memory/modules/${moduleName(file.path)}.md`),
    ],
    runtime_state: [".orca-memory/cache/execution-ledger.md", ".orca-memory/cache/context-state.json"],
    workspace: scoreFiles(index.files, terms)
      .slice(0, 8)
      .map((file) => file.path),
  }
}

export async function captureToolTrace(project: string, toolName: string, target: string, status: string, summary: string) {
  await ensureMemory(project)
  const trace = {
    tool: toolName,
    target: normalizePath(target),
    status,
    summary,
    timestamp: new Date().toISOString(),
  }
  await fs.appendFile(path.join(project, cacheRoot, "tool-trace.jsonl"), `${JSON.stringify(trace)}\n`, "utf8")
  await fs.writeFile(
    path.join(project, cacheRoot, "execution-ledger.md"),
    updateLedger(await fs.readFile(path.join(project, cacheRoot, "execution-ledger.md"), "utf8"), trace),
    "utf8",
  )
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
    ledger: await fs.readFile(path.join(project, cacheRoot, "execution-ledger.md"), "utf8"),
  }
  await fs.writeFile(path.join(project, cacheRoot, "context-state.json"), JSON.stringify(state, null, 2), "utf8")
  return state
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
    .map((file) => ({
      ...file,
      score:
        terms.filter((term) => `${file.path} ${file.summary} ${file.kind}`.toLowerCase().includes(term)).length * 10 +
        (file.kind === "source" ? 3 : file.kind === "test" ? 2 : 1),
    }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
}

function updateLedger(ledger: string, trace: { tool: string; target: string; status: string; summary: string; timestamp: string }) {
  const section =
    trace.tool === "read"
      ? "Files Already Read"
      : trace.tool === "bash" || trace.tool === "shell"
        ? "Commands Already Run"
        : trace.tool === "edit" || trace.tool === "write" || trace.tool === "apply_patch"
          ? "Files Modified"
          : trace.status === "failed" || trace.status === "error"
            ? "Failed Attempts"
            : "Open Questions"
  return appendLedgerItem(ledger, section, `- ${trace.target} (${trace.tool}, ${trace.status}) - ${trace.summary}`)
}

function appendLedgerItem(ledger: string, section: string, item: string) {
  if (ledger.includes(item)) return ledger
  return ledger.replace(`## ${section}\n\n`, `## ${section}\n\n${item}\n`)
}

async function readIndex(project: string) {
  return JSON.parse(await fs.readFile(path.join(project, memoryRoot, "index.json"), "utf8"))
}

async function readTraces(project: string) {
  return fs
    .readFile(path.join(project, cacheRoot, "tool-trace.jsonl"), "utf8")
    .then((text) =>
      text
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line)),
    )
    .catch(() => [])
}

async function indexMarkdown(project: string) {
  return [
    "# Memory Index",
    "",
    ...(await scanProject(project)).map((file) => `- \`${file.path}\` - ${file.summary}`),
    "",
  ].join("\n")
}

async function architectureMarkdown(project: string) {
  const files = await scanProject(project)
  return [
    "# Architecture",
    "",
    "## Detected Areas",
    "",
    ...[...new Set(files.map((file) => file.path.split("/")[0]))].map((area) => `- ${area}`),
    "",
  ].join("\n")
}

function ledgerMarkdown() {
  return [
    "# Execution Ledger",
    "",
    "## Files Already Read",
    "",
    "## Commands Already Run",
    "",
    "## Files Modified",
    "",
    "## Failed Attempts",
    "",
    "## Open Questions",
    "",
  ].join("\n")
}

function goalsMarkdown() {
  return [
    "# Goals",
    "",
    "- Preserve goal sufficiency, state continuity, decision traceability, and workspace freshness.",
    "- Prefer planned context paths over full memory loading.",
    "- Keep tool trace and execution ledger state stable across compression.",
    "",
  ].join("\n")
}

function profileMarkdown(project: string) {
  return ["# Project Profile", "", `- Root: ${project}`, "- Runtime: OpenCode Goal-Oriented Memory Runtime", ""].join("\n")
}

function fileKind(file: string) {
  if (file.startsWith("test/") || file.startsWith("tests/") || file.includes(".test.")) return "test"
  if (file.startsWith("src/") || file.endsWith(".ts") || file.endsWith(".js") || file.endsWith(".py") || file.endsWith(".go"))
    return "source"
  return "project"
}

function moduleName(file: string) {
  return file.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()
}

function normalizePath(file: string) {
  return file.replace(/\\/g, "/")
}

async function exists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false,
  )
}
