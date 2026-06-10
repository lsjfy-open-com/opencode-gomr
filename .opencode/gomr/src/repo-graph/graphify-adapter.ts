import fs from "node:fs/promises"
import path from "node:path"

import type { StaticRepoGraph } from "./static-repo-graph.ts"
import { slug } from "./static-repo-graph.ts"

export async function importGraphify(project: string, inputPath: string): Promise<StaticRepoGraph> {
  const raw = JSON.parse(await fs.readFile(inputPath, "utf8"))
  const nodes = (raw.nodes ?? []).map((node: any) => ({
    id: node.id?.startsWith("repo/") ? node.id : `repo/${slug(node.id || node.path || node.name || "node")}`,
    type: normalizeNodeType(node.type),
    title: node.title || node.name || node.path || node.id || "Graphify Node",
    summary: node.summary || node.description || `Imported Graphify node ${node.id || node.path || ""}`.trim(),
    source: node.source || node.path || "graphify-output.json",
    tags: Array.isArray(node.tags) ? node.tags : ["graphify"],
    importance: typeof node.importance === "number" ? node.importance : 0.5,
  }))
  const edges = (raw.edges ?? []).map((edge: any) => ({
    from: normalizeNodeId(edge.from || edge.source),
    to: normalizeNodeId(edge.to || edge.target),
    type: normalizeEdgeType(edge.type),
    weight: typeof edge.weight === "number" ? edge.weight : 0.5,
  }))
  const graph = {
    version: 1 as const,
    generated_at: new Date().toISOString(),
    project_root: project,
    nodes,
    edges,
  }
  await fs.mkdir(path.join(project, ".orca-memory", "graph"), { recursive: true })
  await fs.writeFile(path.join(project, ".orca-memory", "graph", "static-repo-graph.json"), JSON.stringify(graph, null, 2), "utf8")
  return graph
}

function normalizeNodeId(value: string) {
  return value?.startsWith("repo/") ? value : `repo/${slug(value || "node")}`
}

function normalizeNodeType(type: string) {
  if (["file", "doc", "module", "concept", "task", "spec", "platform"].includes(type)) return type
  return "file"
}

function normalizeEdgeType(type: string) {
  if (["contains", "mentions", "documents", "depends_on", "related_to"].includes(type)) return type
  return "related_to"
}
