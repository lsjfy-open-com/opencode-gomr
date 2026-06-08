import { contextPlan } from "./runtime.ts"

if (!process.argv[2] || !process.argv[3]) {
  console.error("Usage: context-plan.ts <project> <goal>")
  process.exit(1)
}

console.log(JSON.stringify(await contextPlan(process.argv[2], process.argv.slice(3).join(" ")), null, 2))
