import { captureToolTrace } from "./runtime.ts"

if (!process.argv[2] || !process.argv[3] || !process.argv[4] || !process.argv[5]) {
  console.error("Usage: capture-tool-trace.ts <project> <tool> <target> <status> [summary]")
  process.exit(1)
}

console.log(
  JSON.stringify(
    await captureToolTrace(process.argv[2], process.argv[3], process.argv[4], process.argv[5], process.argv.slice(6).join(" ")),
    null,
    2,
  ),
)
