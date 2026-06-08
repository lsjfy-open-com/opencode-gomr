import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, test } from "node:test"
import { promisify } from "node:util"

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

async function pluginHooks(project: string) {
  const mod = await import("../plugins/gomr.ts")
  return mod.GomrPlugin({ directory: project, worktree: project })
}
