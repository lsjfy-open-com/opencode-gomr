import fs from "node:fs/promises"
import path from "node:path"

import { readStaticRepoGraph, slug, type RepoNode, type StaticRepoGraph } from "../repo-graph/static-repo-graph.ts"

export { slug }

export interface ContextBundle {
  id: string
  type:
    | "project_memory"
    | "repo_structure"
    | "task_context"
    | "spec_context"
    | "runtime_context"
    | "workspace_state"
    | "decision_memory"
    | "backtrack_anchor"
  title: string
  summary: string
  score: number
  reason: string
  nodeIds: string[]
}

export interface ContextMaterial {
  id: string
  bundleId: string
  type: "repo_node" | "memory" | "trace" | "ledger" | "decision" | "file" | "path_snapshot"
  title: string
  summary: string
  source: string
  score: number
  reason: string
}

export interface ContextEvidence {
  id: string
  materialId: string
  type: "tool_event" | "digest" | "test_result" | "git_diff" | "trace_summary"
  title: string
  summary: string
  source: string
}

export interface RoutedContextPlan {
  version: 1
  goal: string
  goalId: string
  generated_at: string
  routing: {
    algorithm: "goal-conditioned-ppr"
    llmUsedForRouting: false
  }
  bundles: ContextBundle[]
  selectedMaterials: ContextMaterial[]
  evidence: ContextEvidence[]
  excluded: ContextMaterial[]
  scoreBreakdown: Record<string, ScoreBreakdown>
}

export interface ScoreBreakdown {
  ppr: number
  lexical: number
  state: number
  freshness: number
  importance: number
  backtrack: number
  penalties: number
  score: number
}

const memoryRoot = ".orca-memory"
const pathsRoot = path.join(memoryRoot, "paths")

export async function routeGoal(project: string, goal: string): Promise<RoutedContextPlan> {
  await fs.mkdir(path.join(project, pathsRoot), { recursive: true })
  const graph = await readStaticRepoGraph(project)
  const terms = goalTerms(goal)
  const ppr = personalizedPageRank(graph, terms)
  const scored = graph.nodes
    .filter((node) => node.id !== "repo/root")
    .map((node) => ({ node, breakdown: scoreNode(node, terms, ppr.get(node.id) ?? 0) }))
    .sort((a, b) => b.breakdown.score - a.breakdown.score)
  const selected = scored.slice(0, 12)
  const excluded = scored.slice(12, 24)
  const bundles = bundleSelected(selected)
  const selectedMaterials = selected.map(({ node, breakdown }) => materialFromNode(node, bundleForNode(node), breakdown.score, reasonFor(node, terms)))
  const excludedMaterials = excluded.map(({ node, breakdown }) =>
    materialFromNode(node, bundleForNode(node), breakdown.score, "Excluded because higher-scoring materials satisfy the current goal."),
  )
  const evidence = evidenceForMaterials(selectedMaterials)
  const scoreBreakdown = Object.fromEntries(selected.map(({ node, breakdown }) => [`material/${node.id}`, breakdown]))
  const goalId = slug(goal)
  const plan = {
    version: 1 as const,
    goal,
    goalId,
    generated_at: new Date().toISOString(),
    routing: { algorithm: "goal-conditioned-ppr" as const, llmUsedForRouting: false as const },
    bundles: bundles.map((bundle) => ({
      ...bundle,
      nodeIds: selected.filter(({ node }) => bundleForNode(node) === bundle.id).map(({ node }) => node.id),
    })),
    selectedMaterials,
    evidence,
    excluded: excludedMaterials,
    scoreBreakdown,
  }
  await fs.writeFile(path.join(project, pathsRoot, `${goalId}.json`), JSON.stringify(plan, null, 2), "utf8")
  await fs.writeFile(path.join(project, pathsRoot, "current-route.json"), JSON.stringify(plan, null, 2), "utf8")
  return plan
}

export async function readRoutedPlan(project: string, goalOrId: string): Promise<RoutedContextPlan> {
  const goalId = slug(goalOrId)
  for (const candidate of [goalOrId, goalId]) {
    try {
      return JSON.parse(await fs.readFile(path.join(project, pathsRoot, `${candidate}.json`), "utf8"))
    } catch {
      // continue
    }
  }
  return routeGoal(project, goalOrId)
}

function personalizedPageRank(graph: StaticRepoGraph, terms: string[]) {
  const scores = new Map<string, number>()
  const seedNodes = graph.nodes.filter((node) => lexicalScore(node, terms) > 0)
  for (const node of graph.nodes) scores.set(node.id, seedNodes.includes(node) ? 1 / Math.max(1, seedNodes.length) : 0.02)
  for (let iteration = 0; iteration < 6; iteration++) {
    const next = new Map<string, number>()
    for (const node of graph.nodes) next.set(node.id, (seedNodes.includes(node) ? 0.25 : 0.02) / graph.nodes.length)
    for (const edge of graph.edges) {
      const from = scores.get(edge.from) ?? 0
      next.set(edge.to, (next.get(edge.to) ?? 0) + from * edge.weight * 0.75)
    }
    normalize(next)
    scores.clear()
    for (const [id, value] of next) scores.set(id, value)
  }
  return scores
}

function scoreNode(node: RepoNode, terms: string[], ppr: number): ScoreBreakdown {
  const lexical = lexicalScore(node, terms)
  const state = node.source.startsWith(".opencode/") || node.source.startsWith(".codex/") ? 0.7 : 0.35
  const freshness = node.source.startsWith("src/") || node.source.startsWith("tests/") ? 0.65 : 0.45
  const importance = node.importance ?? 0.5
  const backtrack = node.tags.includes("trace") || node.tags.includes("decision") ? 0.4 : 0.1
  const penalties = node.source.includes("lock") ? 0.2 : 0
  const score = 0.45 * ppr + 0.2 * lexical + 0.15 * state + 0.1 * freshness + 0.05 * importance + 0.05 * backtrack - penalties
  return {
    ppr: round(ppr),
    lexical: round(lexical),
    state: round(state),
    freshness: round(freshness),
    importance: round(importance),
    backtrack: round(backtrack),
    penalties: round(penalties),
    score: round(score),
  }
}

function lexicalScore(node: RepoNode, terms: string[]) {
  if (terms.length === 0) return 0
  const haystack = `${node.title} ${node.summary} ${node.source} ${node.tags.join(" ")}`.toLowerCase()
  const hits = terms.filter((term) => haystack.includes(term)).length
  return Math.min(1, hits / terms.length)
}

function bundleSelected(selected: { node: RepoNode; breakdown: ScoreBreakdown }[]): ContextBundle[] {
  const ids = [...new Set(selected.map(({ node }) => bundleForNode(node)))]
  return ids.map((id) => ({
    id,
    type: bundleType(id),
    title: bundleTitle(id),
    summary: `Goal-relevant ${bundleTitle(id).toLowerCase()} materials selected by deterministic routing.`,
    score: round(Math.max(...selected.filter(({ node }) => bundleForNode(node) === id).map(({ breakdown }) => breakdown.score))),
    reason: "Grouped by source area and selected after goal-conditioned scoring.",
    nodeIds: [],
  }))
}

function materialFromNode(node: RepoNode, bundleId: string, score: number, reason: string): ContextMaterial {
  return {
    id: `material/${node.id}`,
    bundleId,
    type: node.type === "doc" ? "repo_node" : "file",
    title: node.title,
    summary: node.summary,
    source: node.source,
    score: round(score),
    reason,
  }
}

function evidenceForMaterials(materials: ContextMaterial[]): ContextEvidence[] {
  return materials.map((material) => ({
    id: `evidence/${slug(material.id)}`,
    materialId: material.id,
    type: material.source.startsWith("tests/") ? "test_result" : "trace_summary",
    title: `Evidence for ${material.title}`,
    summary: `Selected because ${material.reason}`,
    source: material.source,
  }))
}

function reasonFor(node: RepoNode, terms: string[]) {
  const matched = terms.filter((term) => `${node.title} ${node.summary} ${node.source}`.toLowerCase().includes(term))
  return matched.length ? `Matches goal terms: ${matched.join(", ")}.` : "Connected through repo graph proximity and source importance."
}

function bundleForNode(node: RepoNode) {
  if (/^README/i.test(node.source) || node.source === "package.json") return "bundle/repo-structure"
  if (node.source.startsWith("docs/")) return "bundle/spec-context"
  if (node.source.startsWith("tests/")) return "bundle/workspace-state"
  if (node.source.startsWith(".opencode/") || node.source.startsWith(".codex/")) return "bundle/runtime-context"
  if (node.source.startsWith(".trellis/")) return "bundle/task-context"
  if (node.source.startsWith(".orca-memory/decisions/")) return "bundle/decision-memory"
  return "bundle/task-context"
}

function bundleType(id: string): ContextBundle["type"] {
  if (id.includes("repo-structure")) return "repo_structure"
  if (id.includes("spec-context")) return "spec_context"
  if (id.includes("runtime-context")) return "runtime_context"
  if (id.includes("workspace-state")) return "workspace_state"
  if (id.includes("decision-memory")) return "decision_memory"
  if (id.includes("backtrack")) return "backtrack_anchor"
  return "task_context"
}

function bundleTitle(id: string) {
  return id
    .replace("bundle/", "")
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
}

function normalize(values: Map<string, number>) {
  const max = Math.max(...values.values(), 0.0001)
  for (const [key, value] of values) values.set(key, value / max)
}

function goalTerms(goal: string) {
  return [...new Set(goal.toLowerCase().match(/[a-z0-9_\u4e00-\u9fff-]{2,}/g) ?? [])]
}

function round(value: number) {
  return Math.round(value * 10000) / 10000
}
