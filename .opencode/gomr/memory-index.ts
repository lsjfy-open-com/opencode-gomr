import { initMemory } from "./runtime.ts"

if (process.argv[2] !== "init" || !process.argv[3]) {
  console.error("Usage: memory-index.ts init <project>")
  process.exit(1)
}

await initMemory(process.argv[3])
