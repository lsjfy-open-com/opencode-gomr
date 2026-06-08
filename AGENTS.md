## Goal-Oriented Memory Runtime (GOMR)

- Read `.orca-memory/cache/execution-ledger.md` before broad workspace exploration when the memory store exists.
- Build a context plan for the current goal and load only the selected memory, runtime state, and workspace paths.
- Do not full-load `.orca-memory`.
- Do not directly overwrite memory. Use patch-style updates that preserve previous decisions and state.
- Treat Tool Trace and the execution ledger as the source of action state: files read, commands run, files modified, failed attempts, and open questions.
