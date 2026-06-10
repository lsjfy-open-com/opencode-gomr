import fs from "node:fs/promises"
import path from "node:path"

import { readRoutedPlan, routeGoal, slug, type RoutedContextPlan } from "../routing/goal-router.ts"

export interface BuiltContext {
  goalId: string
  content: string
  path: string
  currentPath: string
  debugPath: string
  plan: RoutedContextPlan
}

export async function buildRebuiltContext(project: string, goalOrId: string): Promise<BuiltContext> {
  const plan = await readRoutedPlan(project, goalOrId)
  return writeContext(project, plan)
}

export async function buildRebuiltContextForGoal(project: string, goal: string): Promise<BuiltContext> {
  const plan = await routeGoal(project, goal)
  return writeContext(project, plan)
}

export async function readCurrentContext(project: string) {
  return fs.readFile(path.join(project, ".orca-memory", "context", "current.md"), "utf8")
}

async function writeContext(project: string, plan: RoutedContextPlan): Promise<BuiltContext> {
  const contextDir = path.join(project, ".orca-memory", "context")
  const debugDir = path.join(project, ".orca-memory", "debug")
  await fs.mkdir(contextDir, { recursive: true })
  await fs.mkdir(debugDir, { recursive: true })
  const content = renderContext(plan)
  const goalId = plan.goalId || slug(plan.goal)
  const targetPath = path.join(contextDir, `${goalId}.md`)
  const currentPath = path.join(contextDir, "current.md")
  const debugPath = path.join(debugDir, "last-model-context.md")
  await fs.writeFile(targetPath, content, "utf8")
  await fs.writeFile(currentPath, content, "utf8")
  await fs.writeFile(debugPath, content, "utf8")
  return { goalId, content, path: targetPath, currentPath, debugPath, plan }
}

function renderContext(plan: RoutedContextPlan) {
  return [
    "# GOMR Rebuilt Context",
    "",
    "mode: replace",
    "raw_context_replaced: true",
    "",
    "## Current Goal",
    "",
    `- id: ${plan.goalId}`,
    `- summary: ${plan.goal}`,
    `- routing: ${plan.routing.algorithm}`,
    `- llmUsedForRouting: ${plan.routing.llmUsedForRouting}`,
    "",
    "## Context Bundles",
    "",
    ...plan.bundles.map((bundle) =>
      [`### ${bundle.title}`, `- id: ${bundle.id}`, `- type: ${bundle.type}`, `- score: ${bundle.score}`, `- reason: ${bundle.reason}`, bundle.summary, ""].join("\n"),
    ),
    "## Selected Materials",
    "",
    ...plan.selectedMaterials.map((material) =>
      [
        `### ${material.title}`,
        `- id: ${material.id}`,
        `- bundle: ${material.bundleId}`,
        `- source: ${material.source}`,
        `- score: ${material.score}`,
        `- reason: ${material.reason}`,
        material.summary,
        "",
      ].join("\n"),
    ),
    "## Evidence / Anchors",
    "",
    ...plan.evidence.map((evidence) =>
      [`### ${evidence.title}`, `- id: ${evidence.id}`, `- material: ${evidence.materialId}`, `- type: ${evidence.type}`, `- source: ${evidence.source}`, evidence.summary, ""].join("\n"),
    ),
    "## Explicitly Excluded Raw Context",
    "",
    ...plan.excluded.slice(0, 12).map((material) => `- ${material.source}: ${material.reason}`),
    "",
    "## Local Retention",
    "",
    "- Raw history, traces, and repo graph remain local under `.orca-memory`.",
    "- Replace mode sends this rebuilt context instead of the full accumulated conversation.",
    "- Tool results from the active turn may still be retained after the latest user message.",
    "",
  ].join("\n")
}
