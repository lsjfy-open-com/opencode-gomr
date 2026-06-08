import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, test } from "node:test"
import { promisify } from "node:util"

import * as runtime from "./runtime.ts"

const tempProjects: string[] = []
const exec = promisify(execFile)

afterEach(async () => {
  await Promise.all(tempProjects.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

test("memory-index init creates the memory store", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "package.json": JSON.stringify({ name: "demo", scripts: { test: "bun test" } }, null, 2),
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "tests/parser.test.ts": "import { test } from 'bun:test'\n",
  })

  await run("memory-index.ts", "init", project)

  assert.equal(await exists(path.join(project, ".orca-memory", "index.json")), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "profile.md")), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "architecture.md")), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "cache", "execution-ledger.md")), true)
})

test("memory-index init creates non-empty v0.2 memory, path, and graph seeds", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "AGENTS.md": "## Goal-Oriented Memory Runtime (GOMR)\n",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "tests/parser.test.ts": "import { test } from 'node:test'\n",
  })

  await run("memory-index.ts", "init", project)

  for (const file of [
    ".orca-memory/profile.md",
    ".orca-memory/architecture.md",
    ".orca-memory/goals.md",
    ".orca-memory/modules/gomr-runtime.md",
    ".orca-memory/modules/context-router.md",
    ".orca-memory/modules/tool-trace.md",
    ".orca-memory/modules/visualization.md",
    ".orca-memory/decisions/0001-gomr-v0.2-memory-model.md",
  ]) {
    const content = await fs.readFile(path.join(project, file), "utf8")
    assert.match(content, /^---\nid: memory\//)
    assert.match(content, /summary: .+/)
    assert.match(content, /## Summary\n\n.+/)
  }

  const nodes = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "graph", "nodes.json"), "utf8"))
  assert.equal(nodes.some((node) => node.id === "memory/profile"), true)
  assert.equal(nodes.some((node) => node.id === "memory/modules/context-router"), true)
  assert.equal(nodes.some((node) => node.id === "memory/modules/tool-trace"), true)
  assert.equal(nodes.some((node) => node.id === "memory/modules/visualization"), true)

  const latest = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "paths", "latest.json"), "utf8"))
  assert.equal(latest.turn_id, "turn-0000")
  assert.equal(Array.isArray(latest.selected_path), true)
})

test("context-plan includes runtime state and goal-relevant workspace files", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "src/render.ts": "export function render(input: string) { return input }\n",
  })

  await run("memory-index.ts", "init", project)

  const plan = JSON.parse((await run("context-plan.ts", project, "fix parser tests")).stdout)

  assert.equal(plan.goal, "fix parser tests")
  assert.equal(plan.runtime_state.includes(".orca-memory/cache/execution-ledger.md"), true)
  assert.equal(plan.workspace.includes("src/parser.ts"), true)
})

test("context-plan generates a path snapshot with readable selected, excluded, diff, and backtrack nodes", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "src/render.ts": "export function render(input: string) { return input }\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")
  const plan = JSON.parse((await run("context-plan.ts", project, "fix parser tests")).stdout)

  assert.equal(plan.snapshot.turn_id.startsWith("turn-"), true)
  assert.equal(plan.snapshot.selected_path.every((node) => node.title && node.summary), true)
  assert.equal(plan.snapshot.excluded.every((node) => node.reason), true)
  assert.equal(Array.isArray(plan.snapshot.diff_from_previous_turn.added), true)
  assert.equal(plan.snapshot.backtrack_candidates.length > 0, true)

  const latest = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "paths", "latest.json"), "utf8"))
  assert.equal(latest.turn_id, plan.snapshot.turn_id)
  assert.equal(await exists(path.join(project, ".orca-memory", "paths", `${plan.snapshot.turn_id}.json`)), true)
})

test("capture-tool-trace appends JSONL and updates the execution ledger", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")

  assert.deepEqual(
    pick(JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "cache", "tool-trace.jsonl"), "utf8").then((text) => text.trim())), [
      "tool",
      "target",
      "status",
      "summary",
    ]),
    {
    tool: "read",
    target: "src/parser.ts",
    status: "success",
    summary: "Parser core",
    },
  )
  assert.equal(
    (await fs.readFile(path.join(project, ".orca-memory", "cache", "execution-ledger.md"), "utf8")).includes(
    "src/parser.ts",
    ),
    true,
  )
})

test("capture-tool-trace persists v0.2 session traces with digests and ledger table rows", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")

  const traceFile = path.join(project, ".orca-memory", "traces", "session-default.jsonl")
  const trace = JSON.parse((await fs.readFile(traceFile, "utf8")).trim())
  assert.equal(trace.session_id, "session-default")
  assert.equal(trace.turn_id.startsWith("turn-"), true)
  assert.equal(trace.target, "src/parser.ts")
  assert.equal(trace.status, "success")
  assert.equal(trace.summary, "Parser core")
  assert.match(trace.input_digest, /^sha256:/)
  assert.match(trace.output_digest, /^sha256:/)
  assert.equal(trace.context_relevance.reason.includes("current goal"), true)

  const ledger = await fs.readFile(path.join(project, ".orca-memory", "cache", "execution-ledger.md"), "utf8")
  assert.equal(ledger.includes("| Path | Summary | Last Turn | Digest |"), true)
  assert.equal(ledger.includes("| src/parser.ts | Parser core |"), true)
})

test("failed traces are recorded as failed attempts before tool category rows", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/missing.ts", "failed", "File was missing")

  const ledger = await fs.readFile(path.join(project, ".orca-memory", "cache", "execution-ledger.md"), "utf8")
  const failedSection = section(ledger, "Failed Attempts")
  const readSection = section(ledger, "Files Already Read")
  assert.equal(failedSection.includes("src/missing.ts"), true)
  assert.equal(readSection.includes("src/missing.ts"), false)
})

test("ledger updates current goal when a context plan is generated", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("context-plan.ts", project, "fix parser tests")

  const ledger = await fs.readFile(path.join(project, ".orca-memory", "cache", "execution-ledger.md"), "utf8")
  assert.equal(section(ledger, "Current Goal").includes("fix parser tests"), true)
})

test("repeated reads update the ledger digest and create backtrack candidates", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser v1")
  await fs.writeFile(path.join(project, "src", "parser.ts"), "export const parser = 'v2'\n")
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser v2")
  const plan = JSON.parse((await run("context-plan.ts", project, "fix parser tests")).stdout)

  const traces = (await fs.readFile(path.join(project, ".orca-memory", "traces", "session-default.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.notEqual(traces[0].input_digest, traces[1].input_digest)

  const ledger = await fs.readFile(path.join(project, ".orca-memory", "cache", "execution-ledger.md"), "utf8")
  assert.equal((section(ledger, "Files Already Read").match(/src\/parser\.ts/g) || []).length, 1)
  assert.equal(section(ledger, "Files Already Read").includes("Parser v2"), true)
  assert.equal(plan.snapshot.backtrack_candidates.some((candidate) => candidate.summary.includes("Parser v1")), true)
  assert.equal(plan.snapshot.backtrack_candidates.some((candidate) => candidate.summary.includes("Parser v2")), true)
})

test("runtime traces are separated by session and mirrored to compatibility cache", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await runtime.initMemory(project)
  await runtime.captureToolTrace(project, "read", "src/parser.ts", "success", "Parser alpha", { sessionId: "session-alpha" })
  await runtime.captureToolTrace(project, "read", "README.md", "success", "Readme beta", { sessionId: "session-beta" })

  assert.equal(await exists(path.join(project, ".orca-memory", "traces", "session-alpha.jsonl")), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "traces", "session-beta.jsonl")), true)
  const cacheMirror = await fs.readFile(path.join(project, ".orca-memory", "cache", "tool-trace.jsonl"), "utf8")
  assert.equal(cacheMirror.includes("Parser alpha"), true)
  assert.equal(cacheMirror.includes("Readme beta"), true)
})

test("memory-index init preserves existing runtime records", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")
  await run("memory-index.ts", "init", project)

  assert.equal(
    (await fs.readFile(path.join(project, ".orca-memory", "cache", "tool-trace.jsonl"), "utf8")).includes(
      "src/parser.ts",
    ),
    true,
  )
  assert.equal(
    (await fs.readFile(path.join(project, ".orca-memory", "cache", "execution-ledger.md"), "utf8")).includes(
      "src/parser.ts",
    ),
    true,
  )
})

test("build-context-state summarizes index, trace, and ledger state", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")
  await run("build-context-state.ts", project)

  assert.deepEqual(pick(JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "cache", "context-state.json"), "utf8")), [
    "trace_count",
    "recent_tools",
  ]), {
    trace_count: 1,
    recent_tools: ["read"],
  })
})

test("graph build and visual export create readable timeline artifacts", async () => {
  assert.equal(typeof runtime.buildGraphData, "function")
  assert.equal(typeof runtime.exportVisual, "function")

  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")
  await run("context-plan.ts", project, "fix parser tests")
  const graph = await runtime.buildGraphData(project)
  await runtime.exportVisual(project)

  assert.equal(graph.nodes.length > 0, true)
  assert.equal(graph.edges.some((edge) => edge.type === "selected_for_goal"), true)
  assert.equal(graph.timeline.length > 0, true)

  const visual = await fs.readFile(path.join(project, ".orca-memory", "visual", "index.html"), "utf8")
  assert.equal(visual.includes("Turn Timeline"), true)
  assert.equal(visual.includes("Path Graph"), true)
  assert.equal(visual.includes("Node Detail"), true)

  const visualGraph = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "visual", "graph-data.json"), "utf8"))
  assert.equal(visualGraph.nodes.length >= graph.nodes.length, true)
  assert.equal(visualGraph.nodes.some((node) => node.id === "ledger/execution"), true)
})

test("visual export builds expanded turn, node, edge, and context block data", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "src/render.ts": "export function render(input: string) { return input }\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")
  await run("context-plan.ts", project, "fix parser tests")
  await run("context-plan.ts", project, "fix render tests")
  await runtime.exportVisual(project)

  const visualData = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "visual", "graph-data.json"), "utf8"))
  assert.equal(Array.isArray(visualData.turns), true)
  assert.equal(Array.isArray(visualData.nodes), true)
  assert.equal(Array.isArray(visualData.edges), true)
  assert.equal(visualData.turns.length >= 2, true)

  for (const turn of visualData.turns) {
    assert.equal(typeof turn.goal, "string")
    assert.equal(turn.goal.length > 0, true)
    assert.equal(turn.path.length > 0, true)
    assert.equal(typeof turn.rawContextTokens, "number")
    assert.equal(typeof turn.rebuiltContextTokens, "number")
    assert.equal(turn.rawContextTokens >= turn.rebuiltContextTokens, true)
    assert.equal(turn.contextBlocks.some((block) => block.usedInRebuiltContext), true)
    assert.equal(turn.contextBlocks.some((block) => !block.usedInRebuiltContext), true)
  }
})

test("visual export uses imported OpenCode session titles for generic turn goals", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
  })

  await run("memory-index.ts", "init", project)
  await runtime.contextPlan(project, "current OpenCode task", { sessionId: "ses_ABCDef123" })
  await fs.writeFile(
    path.join(project, ".orca-memory", "cache", "session-goals.json"),
    JSON.stringify(
      {
        version: 1,
        sessions: {
          "ses-abcdef123": {
            original_id: "ses_ABCDef123",
            title: "Fix PageIndex memory visualization titles",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  )

  await runtime.exportVisual(project)

  const visualData = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "visual", "graph-data.json"), "utf8"))
  const latestTurn = visualData.turns.at(-1)
  assert.equal(latestTurn.title, "Fix PageIndex memory visualization titles")
  assert.equal(latestTurn.goal, "Fix PageIndex memory visualization titles")
  assert.equal(
    visualData.nodes.some((node) => node.id === "goal/ses-abcdef123/turn-0001" && node.title === "Fix PageIndex memory visualization titles"),
    true,
  )
})

test("runtime imports OpenCode session list titles by normalized session id", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  const imported = await runtime.importOpenCodeSessionGoals(project, {
    listOutput: [
      "Session ID                      Title                      Updated",
      "ses_1592f41c6ffepHerILBn6FNrl8  验证GOMR可视化轮次标题写入用户目标        18:40",
      "ses_15979edc4ffetVQ6iVz4GI1Wvq  当前项目理解                     18:40",
    ].join("\n"),
  })

  assert.equal(imported.sessions["ses-1592f41c6ffepherilbn6fnrl8"].title, "验证GOMR可视化轮次标题写入用户目标")
  assert.equal(imported.sessions["ses-15979edc4ffetvq6ivz4gi1wvq"].original_id, "ses_15979edc4ffetVQ6iVz4GI1Wvq")

  const cached = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "cache", "session-goals.json"), "utf8"))
  assert.equal(cached.sessions["ses-1592f41c6ffepherilbn6fnrl8"].title, "验证GOMR可视化轮次标题写入用户目标")
})

test("visual data links selected and excluded nodes to readable node records", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "src/render.ts": "export function render(input: string) { return input }\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")
  await run("context-plan.ts", project, "fix parser tests")
  await runtime.exportVisual(project)

  const visualData = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "visual", "graph-data.json"), "utf8"))
  const nodeMap = new Map(visualData.nodes.map((node) => [node.id, node]))

  for (const turn of visualData.turns) {
    for (const id of [...turn.path, ...turn.excluded]) {
      const node = nodeMap.get(id)
      assert.notEqual(node, undefined)
      assert.equal(node.title.length > 0, true)
      assert.equal(node.summary.length > 0, true)
      assert.equal((node.reason || "fallback").length > 0, true)
    }
  }
})

test("visual trace nodes include tool metadata, digests, evidence, and reuse hints", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("capture-tool-trace.ts", project, "read", "src/parser.ts", "success", "Parser core")
  await run("context-plan.ts", project, "fix parser tests")
  await runtime.exportVisual(project)

  const visualData = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "visual", "graph-data.json"), "utf8"))
  const traceNode = visualData.nodes.find((node) => node.type === "trace" && node.source.includes("session-default.jsonl"))
  assert.notEqual(traceNode, undefined)
  assert.equal(traceNode.metadata.tool, "read")
  assert.equal(traceNode.metadata.target, "src/parser.ts")
  assert.match(traceNode.metadata.inputDigest, /^sha256:/)
  assert.match(traceNode.metadata.outputDigest, /^sha256:/)
  assert.equal(traceNode.metadata.evidencePath, "src/parser.ts")
  assert.equal(traceNode.relations.some((relation) => relation.includes("reuse")), true)
})

test("visual shell uses the expanded dark three-view demo interface", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("context-plan.ts", project, "fix parser tests")
  await runtime.exportVisual(project)

  const visual = await fs.readFile(path.join(project, ".orca-memory", "visual", "index.html"), "utf8")
  assert.equal(visual.includes("GOMR Context Reconstruction Visualization"), true)
  assert.equal(visual.includes("图路径：全局节点中点亮本轮路径"), true)
  assert.equal(visual.includes("树视图：路径节点展开"), true)
  assert.equal(visual.includes("对比：不重构 vs 重构后 Context"), true)
  assert.equal(visual.includes("自动播放"), true)
  assert.equal(visual.includes("最新轮"), true)
  assert.equal(visual.includes("fetch(\"graph-data.json"), true)
  assert.equal(visual.includes("../paths/latest.json"), true)
})

test("graph data contains every selected path node and selected_for_goal edge", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "src/render.ts": "export function render(input: string) { return input }\n",
  })

  await run("memory-index.ts", "init", project)
  const plan = JSON.parse((await run("context-plan.ts", project, "fix parser tests")).stdout)
  const graph = await runtime.buildGraphData(project)
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const selectedIds = plan.snapshot.selected_path.map((node) => node.id)

  assert.equal(selectedIds.every((id) => nodeIds.has(id)), true)
  assert.equal(
    selectedIds.every((id) =>
      graph.edges.some((edge) => edge.from === plan.snapshot.goal.id && edge.to === id && edge.type === "selected_for_goal"),
    ),
    true,
  )
})

test("successive snapshots report added removed and kept node ids", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
    "src/render.ts": "export function render(input: string) { return input }\n",
  })

  await run("memory-index.ts", "init", project)
  const first = JSON.parse((await run("context-plan.ts", project, "fix parser tests")).stdout).snapshot
  const second = JSON.parse((await run("context-plan.ts", project, "fix render tests")).stdout).snapshot

  assert.equal(second.diff_from_previous_turn.kept.includes("memory/profile"), true)
  assert.equal(second.diff_from_previous_turn.added.length > 0, true)
  assert.equal(second.diff_from_previous_turn.removed.length > 0, true)
  assert.notEqual(first.turn_id, second.turn_id)
})

test("visual export includes polling and renders diff/detail regions", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("memory-index.ts", "init", project)
  await run("context-plan.ts", project, "fix parser tests")
  await runtime.exportVisual(project)

  const visual = await fs.readFile(path.join(project, ".orca-memory", "visual", "index.html"), "utf8")
  assert.equal(visual.includes("setInterval(loadGraph, 1500)"), true)
  assert.equal(visual.includes("Added nodes"), true)
  assert.equal(visual.includes("Removed nodes"), true)
  assert.equal(visual.includes("Kept nodes"), true)
  assert.equal(visual.includes("../paths/latest.json"), true)
})

test("gomr CLI exposes v0.2 init, trace, plan, graph, and visual commands", async () => {
  const project = await createProject({
    "README.md": "# Demo\n\nA parser project.",
    "src/parser.ts": "export function parse(input: string) { return input.trim() }\n",
  })

  await run("gomr.ts", "init", project)
  await run("gomr.ts", "trace", "append", project, "--tool", "read", "--target", "src/parser.ts", "--status", "success", "--summary", "Parser core")
  const plan = JSON.parse((await run("gomr.ts", "plan", project, "--goal", "fix parser tests")).stdout)
  await run("gomr.ts", "graph", "build", project)
  await run("gomr.ts", "visual", "export", project)

  assert.equal(plan.goal, "fix parser tests")
  assert.equal(await exists(path.join(project, ".orca-memory", "traces", "session-default.jsonl")), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "graph", "graph-data.json")), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "visual", "index.html")), true)
})

test("gomr CLI snapshot returns the generated turn snapshot", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })

  await run("gomr.ts", "init", project)
  const snapshot = JSON.parse((await run("gomr.ts", "snapshot", project, "--goal", "fix parser tests")).stdout)

  assert.equal(snapshot.goal.summary, "fix parser tests")
  assert.equal(snapshot.selected_path.every((node) => node.title && node.summary), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "paths", `${snapshot.turn_id}.json`)), true)
})

test("plugin injects a context plan into system context", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })
  const hooks = await pluginHooks(project)
  const output = { system: [] as string[] }

  await hooks["experimental.chat.system.transform"]({ sessionID: "session-1", model: {} }, output)

  assert.equal(await exists(path.join(project, ".orca-memory", "index.json")), true)
  assert.equal(output.system.some((entry) => entry.includes("Goal-Oriented Memory Runtime")), true)
  assert.equal(output.system.some((entry) => entry.includes("context-plan")), true)
})

test("plugin uses the latest user message as the context plan goal", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })
  const hooks = await pluginHooks(project)
  const output = { system: [] as string[] }

  await hooks["experimental.chat.system.transform"](
    {
      sessionID: "session-1",
      model: {},
      messages: [
        { role: "user", content: "Improve PageIndex retrieval summaries" },
        { role: "assistant", content: "I'll inspect the repo." },
        { role: "user", content: "Add real goal titles to the GOMR visualization" },
      ],
    },
    output,
  )

  const latest = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "paths", "latest.json"), "utf8"))
  assert.equal(latest.goal.summary, "Add real goal titles to the GOMR visualization")
  assert.equal(output.system.some((entry) => entry.includes("Add real goal titles to the GOMR visualization")), true)
})

test("plugin preserves the recorded goal when refreshing snapshots after tools", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })
  const hooks = await pluginHooks(project)

  await hooks["experimental.chat.system.transform"](
    {
      sessionID: "session-1",
      model: {},
      messages: [{ role: "user", content: [{ type: "text", text: "Render real GOMR turn goals" }] }],
    },
    { system: [] as string[] },
  )
  await hooks["tool.execute.after"](
    { tool: "read", sessionID: "session-1", callID: "call-1", args: { filePath: "src/parser.ts" } },
    { title: "Read src/parser.ts", output: "Parser core", metadata: {} },
  )

  const latest = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "paths", "latest.json"), "utf8"))
  const visualData = JSON.parse(await fs.readFile(path.join(project, ".orca-memory", "visual", "graph-data.json"), "utf8"))
  assert.equal(latest.goal.summary, "Render real GOMR turn goals")
  assert.equal(visualData.turns.at(-1).goal, "Render real GOMR turn goals")
})

test("plugin records tool traces after tool execution", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })
  const hooks = await pluginHooks(project)

  await hooks["tool.execute.after"](
    { tool: "read", sessionID: "session-1", callID: "call-1", args: { filePath: "src/parser.ts" } },
    { title: "Read src/parser.ts", output: "Parser core", metadata: {} },
  )

  assert.equal(
    (await fs.readFile(path.join(project, ".orca-memory", "cache", "tool-trace.jsonl"), "utf8")).includes(
      "src/parser.ts",
    ),
    true,
  )
  assert.equal(await exists(path.join(project, ".orca-memory", "traces", "session-1.jsonl")), true)
  assert.equal(await exists(path.join(project, ".orca-memory", "paths", "latest.json")), true)
})

test("plugin injects execution ledger context during compaction", async () => {
  const project = await createProject({
    "README.md": "# Demo\n",
    "src/parser.ts": "export const parser = true\n",
  })
  const hooks = await pluginHooks(project)
  const output = { context: [] as string[] }

  await hooks["tool.execute.after"](
    { tool: "read", sessionID: "session-1", callID: "call-1", args: { filePath: "src/parser.ts" } },
    { title: "Read src/parser.ts", output: "Parser core", metadata: {} },
  )
  await hooks["experimental.session.compacting"]({ sessionID: "session-1" }, output)

  assert.equal(output.context.some((entry) => entry.includes("GOMR Execution Ledger")), true)
  assert.equal(output.context.some((entry) => entry.includes("src/parser.ts")), true)
})

test("agent, skill, and root protocol describe GOMR guardrails", async () => {
  const root = path.resolve(import.meta.dirname, "../..")
  const agent = await fs.readFile(path.join(root, ".opencode", "agents", "context-router.md"), "utf8")
  const skill = await fs.readFile(path.join(root, ".opencode", "skills", "context-path-builder", "SKILL.md"), "utf8")
  const agents = await fs.readFile(path.join(root, "AGENTS.md"), "utf8")

  for (const content of [agent, skill, agents]) {
    assert.equal(content.includes(".orca-memory/cache/execution-ledger.md"), true)
    assert.equal(content.includes("context plan"), true)
    assert.equal(content.includes("Do not full-load `.orca-memory`"), true)
    assert.equal(content.includes("Tool Trace"), true)
    assert.equal(content.includes("Do not directly overwrite memory"), true)
  }
})

test("repository includes global OpenCode installers", async () => {
  const root = path.resolve(import.meta.dirname, "../..")
  const powershell = await fs.readFile(path.join(root, "install-global.ps1"), "utf8")
  const shell = await fs.readFile(path.join(root, "install-global.sh"), "utf8")
  const readme = await fs.readFile(path.join(root, "README.md"), "utf8")

  assert.equal(powershell.includes("$env:USERPROFILE\\.config\\opencode"), true)
  assert.equal(powershell.includes(".opencode\\plugins\\gomr.ts"), true)
  assert.equal(shell.includes("${HOME}/.config/opencode"), true)
  assert.equal(shell.includes(".opencode/plugins/gomr.ts"), true)
  assert.equal(readme.includes("Global Install"), true)
})

async function createProject(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gomr-test-"))
  tempProjects.push(dir)
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true })
      await fs.writeFile(path.join(dir, name), content)
    }),
  )
  return dir
}

async function exists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false,
  )
}

async function run(script: string, ...args: string[]) {
  return exec(process.execPath, [path.join(import.meta.dirname, script), ...args], { cwd: import.meta.dirname })
}

function pick(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, record[key]]))
}

function section(markdown: string, heading: string) {
  const start = markdown.indexOf(`## ${heading}`)
  if (start === -1) return ""
  const next = markdown.indexOf("\n## ", start + 1)
  return markdown.slice(start, next === -1 ? markdown.length : next)
}

async function pluginHooks(project: string) {
  const mod = await import("../plugins/gomr.ts")
  return mod.GomrPlugin({ directory: project, worktree: project })
}
