import fs from "node:fs/promises"
import path from "node:path"

export type RepoNodeType = "file" | "doc" | "module" | "concept" | "task" | "spec" | "platform"
export type RepoEdgeType = "contains" | "mentions" | "documents" | "depends_on" | "related_to"

export interface RepoNode {
  id: string
  type: RepoNodeType
  title: string
  summary: string
  source: string
  tags: string[]
  importance?: number
  updatedAt?: string
}

export interface RepoEdge {
  from: string
  to: string
  type: RepoEdgeType
  weight: number
}

export interface StaticRepoGraph {
  version: 1
  generated_at: string
  project_root: string
  nodes: RepoNode[]
  edges: RepoEdge[]
}

const memoryRoot = ".orca-memory"
const graphPath = path.join(memoryRoot, "graph", "static-repo-graph.json")
const scanRoots = ["README.md", "README", "docs", "src", "tests", ".trellis", ".opencode", ".codex", "package.json"]
const ignoredDirs = new Set([".git", "node_modules", ".orca-memory", "dist", "build", ".next", ".turbo"])

export async function buildStaticRepoGraph(project: string): Promise<StaticRepoGraph> {
  const nodes = new Map<string, RepoNode>()
  const edges: RepoEdge[] = []

  addNode(nodes, {
    id: "repo/root",
    type: "platform",
    title: path.basename(project) || "Repository",
    summary: "Repository root and static graph anchor.",
    source: ".",
    tags: ["repo", "root"],
    importance: 1,
  })

  for (const entry of await scanCandidateFiles(project)) {
    const node = await nodeFromFile(project, entry)
    addNode(nodes, node)
    edges.push({ from: "repo/root", to: node.id, type: "contains", weight: containsWeight(node) })
  }

  const nodeList = [...nodes.values()]
  for (const source of nodeList) {
    if (source.id === "repo/root") continue
    for (const target of nodeList) {
      if (target.id === "repo/root" || target.id === source.id) continue
      const weight = mentionWeight(source, target)
      if (weight > 0) edges.push({ from: source.id, to: target.id, type: source.type === "doc" ? "documents" : "mentions", weight })
    }
  }

  const graph = {
    version: 1 as const,
    generated_at: new Date().toISOString(),
    project_root: project,
    nodes: nodeList,
    edges: dedupeEdges(edges),
  }
  await fs.mkdir(path.join(project, memoryRoot, "graph"), { recursive: true })
  await fs.writeFile(path.join(project, graphPath), JSON.stringify(graph, null, 2), "utf8")
  return graph
}

export async function readStaticRepoGraph(project: string): Promise<StaticRepoGraph> {
  try {
    return JSON.parse(await fs.readFile(path.join(project, graphPath), "utf8"))
  } catch {
    return buildStaticRepoGraph(project)
  }
}

async function scanCandidateFiles(project: string) {
  const results: string[] = []
  for (const root of scanRoots) {
    await collect(project, root, results)
  }
  return [...new Set(results)].sort()
}

async function collect(project: string, relativePath: string, results: string[]) {
  const fullPath = path.join(project, relativePath)
  let stat
  try {
    stat = await fs.stat(fullPath)
  } catch {
    return
  }
  if (stat.isDirectory()) {
    const name = path.basename(relativePath)
    if (ignoredDirs.has(name)) return
    for (const child of await fs.readdir(fullPath)) {
      await collect(project, path.join(relativePath, child), results)
    }
    return
  }
  if (stat.isFile()) results.push(normalizePath(relativePath))
}

async function nodeFromFile(project: string, source: string): Promise<RepoNode> {
  const text = await fs.readFile(path.join(project, source), "utf8").catch(() => "")
  const title = titleFor(source, text)
  const tags = tagsFor(source, text)
  return {
    id: `repo/${slug(source)}`,
    type: typeFor(source),
    title,
    summary: summaryFor(source, text),
    source,
    tags,
    importance: importanceFor(source, tags),
  }
}

function typeFor(source: string): RepoNodeType {
  if (/^README/i.test(source) || source.startsWith("docs/")) return "doc"
  if (source.includes("spec") || source.endsWith(".md") && source.startsWith(".trellis/")) return "spec"
  if (source.startsWith(".trellis/") || source.startsWith(".codex/")) return "task"
  if (source === "package.json" || source.startsWith(".opencode/")) return "module"
  if (source.startsWith("src/") || source.startsWith("tests/")) return "file"
  return "file"
}

function titleFor(source: string, text: string) {
  const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim()
  return heading || source
}

function summaryFor(source: string, text: string) {
  const paragraph = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"))
  return (paragraph || `Repository material from ${source}.`).slice(0, 240)
}

function tagsFor(source: string, text: string) {
  const tags = new Set<string>()
  for (const part of source.toLowerCase().split(/[\\/._-]+/).filter(Boolean)) tags.add(part)
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []) {
    if (tags.size > 18) break
    tags.add(word)
  }
  return [...tags]
}

function importanceFor(source: string, tags: string[]) {
  if (/^README/i.test(source)) return 1
  if (source === "package.json") return 0.9
  if (source.startsWith("docs/")) return 0.78
  if (source.startsWith("src/")) return 0.72
  if (source.startsWith("tests/")) return 0.64
  if (source.startsWith(".opencode/")) return 0.58
  return Math.min(0.6, 0.2 + tags.length / 40)
}

function containsWeight(node: RepoNode) {
  return Math.max(0.25, Math.min(1, node.importance ?? 0.5))
}

function mentionWeight(source: RepoNode, target: RepoNode) {
  const shared = source.tags.filter((tag) => target.tags.includes(tag) && tag.length > 3)
  if (shared.length === 0) return 0
  return Math.min(0.8, 0.15 + shared.length * 0.08)
}

function addNode(nodes: Map<string, RepoNode>, node: RepoNode) {
  if (!nodes.has(node.id)) nodes.set(node.id, node)
}

function dedupeEdges(edges: RepoEdge[]) {
  const byKey = new Map<string, RepoEdge>()
  for (const edge of edges) {
    const key = `${edge.from}->${edge.to}:${edge.type}`
    const current = byKey.get(key)
    if (!current || edge.weight > current.weight) byKey.set(key, edge)
  }
  return [...byKey.values()]
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/")
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "goal"
}
