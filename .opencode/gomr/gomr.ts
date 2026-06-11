import http from "node:http"
import path from "node:path"

import {
  buildContextState,
  buildContextForGoal,
  buildRepoGraph,
  buildGraphData,
  captureToolTrace,
  contextPlan,
  exportVisual,
  importGraphifyRepoGraph,
  importOpenCodeTelemetry,
  importOpenCodeSessionGoals,
  initMemory,
} from "./runtime.ts"

const [command, subcommandOrProject, ...rest] = process.argv.slice(2)

try {
  if (command === "init") {
    await initMemory(requireProject(subcommandOrProject))
    console.log("Initialized GOMR memory store.")
  } else if (command === "index") {
    await initMemory(requireProject(subcommandOrProject))
    console.log("Rebuilt GOMR memory index.")
  } else if (command === "trace" && subcommandOrProject === "append") {
    const project = requireProject(rest.shift())
    const flags = parseFlags(rest)
    console.log(
      JSON.stringify(
        await captureToolTrace(
          project,
          flags.tool || "unknown",
          flags.target || "unknown",
          flags.status || "success",
          flags.summary || "Tool completed",
          { sessionId: flags.session, goal: flags.goal },
        ),
        null,
        2,
      ),
    )
  } else if (command === "ledger" && subcommandOrProject === "update") {
    const project = requireProject(rest.shift())
    console.log(JSON.stringify(await buildContextState(project), null, 2))
  } else if (command === "repo" && subcommandOrProject === "build") {
    const project = requireProject(rest.shift())
    const graph = await buildRepoGraph(project)
    console.log(JSON.stringify({ path: path.join(".orca-memory", "graph", "static-repo-graph.json"), nodes: graph.nodes.length, edges: graph.edges.length }, null, 2))
  } else if (command === "repo" && subcommandOrProject === "import-graphify") {
    const project = requireProject(rest.shift())
    const flags = parseFlags(rest)
    if (!flags.input) throw new Error("Missing --input <graphify-output.json>.")
    console.log(JSON.stringify(await importGraphifyRepoGraph(project, flags.input), null, 2))
  } else if (command === "plan") {
    const project = requireProject(subcommandOrProject)
    const flags = parseFlags(rest)
    console.log(JSON.stringify(await contextPlan(project, flags.goal || "current OpenCode task", { sessionId: flags.session }), null, 2))
  } else if (command === "context" && subcommandOrProject === "build") {
    const project = requireProject(rest.shift())
    const flags = parseFlags(rest)
    console.log(JSON.stringify(await buildContextForGoal(project, flags.goal || "current OpenCode task"), null, 2))
  } else if (command === "snapshot") {
    const project = requireProject(subcommandOrProject)
    const flags = parseFlags(rest)
    console.log(JSON.stringify((await contextPlan(project, flags.goal || "current OpenCode task", { sessionId: flags.session })).snapshot, null, 2))
  } else if (command === "graph" && subcommandOrProject === "build") {
    const project = requireProject(rest.shift())
    console.log(JSON.stringify(await buildGraphData(project), null, 2))
  } else if (command === "sessions" && subcommandOrProject === "import") {
    const project = requireProject(rest.shift())
    console.log(JSON.stringify(await importOpenCodeSessionGoals(project), null, 2))
  } else if (command === "telemetry" && subcommandOrProject === "import") {
    const project = requireProject(rest.shift())
    const flags = parseFlags(rest)
    console.log(JSON.stringify(await importOpenCodeTelemetry(project, { traceDir: flags["trace-dir"] }), null, 2))
  } else if (command === "visual" && subcommandOrProject === "export") {
    const project = requireProject(rest.shift())
    await exportVisual(project)
    console.log(path.join(project, ".orca-memory", "visual", "index.html"))
  } else if (command === "visual" && subcommandOrProject === "serve") {
    const project = requireProject(rest.shift())
    const flags = parseFlags(rest)
    await exportVisual(project)
    serveVisual(project, Number(flags.port || 8787))
  } else {
    usage()
    process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

function parseFlags(args: string[]) {
  const flags: Record<string, string> = {}
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg.startsWith("--")) continue
    flags[arg.slice(2)] = args[index + 1] && !args[index + 1].startsWith("--") ? args[++index] : "true"
  }
  return flags
}

function requireProject(project?: string) {
  if (!project) throw new Error("Missing project path.")
  return project
}

function serveVisual(project: string, port: number) {
  const visualDir = path.join(project, ".orca-memory", "visual")
  const server = http.createServer(async (request, response) => {
    const fs = await import("node:fs/promises")
    const target = request.url?.split("?")[0] === "/graph-data.json" ? "graph-data.json" : "index.html"
    const content = await fs.readFile(path.join(visualDir, target))
    response.setHeader("content-type", target.endsWith(".json") ? "application/json" : "text/html; charset=utf-8")
    response.end(content)
  })
  server.listen(port, () => console.log(`Serving GOMR visual at http://localhost:${port}`))
}

function usage() {
  console.error(`Usage:
  gomr.ts init <project>
  gomr.ts index <project>
  gomr.ts trace append <project> --tool <tool> --target <target> --status <status> --summary <summary>
  gomr.ts ledger update <project>
  gomr.ts repo build <project>
  gomr.ts repo import-graphify <project> --input <graphify-output.json>
  gomr.ts plan <project> --goal "<goal>"
  gomr.ts context build <project> --goal "<goal-id>"
  gomr.ts snapshot <project> --goal "<goal>"
  gomr.ts graph build <project>
  gomr.ts sessions import <project>
  gomr.ts telemetry import <project> [--trace-dir <dir>]
  gomr.ts visual export <project>
  gomr.ts visual serve <project> [--port 8787]`)
}
