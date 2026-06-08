import { buildContextState } from "./runtime.ts"

if (!process.argv[2]) {
  console.error("Usage: build-context-state.ts <project>")
  process.exit(1)
}

console.log(JSON.stringify(await buildContextState(process.argv[2]), null, 2))
