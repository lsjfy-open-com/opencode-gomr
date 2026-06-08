param(
  [string]$ConfigPath = "$env:USERPROFILE\.config\opencode"
)

$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = $ConfigPath
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Copy-GomrPath($relativePath, $targetRelativePath) {
  $source = Join-Path $packageRoot $relativePath
  $destination = Join-Path $target $targetRelativePath
  if (Test-Path $destination) {
    Rename-Item $destination "$destination.backup-$stamp"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Copy-Item $source $destination -Recurse -Force
}

Copy-GomrPath ".opencode\gomr" "gomr"
Copy-GomrPath ".opencode\plugins\gomr.ts" "plugins\gomr.ts"
Copy-GomrPath ".opencode\agents\context-router.md" "agents\context-router.md"
Copy-GomrPath ".opencode\skills\context-path-builder" "skills\context-path-builder"

$agentsPath = Join-Path $target "AGENTS-GOMR.md"
Copy-Item (Join-Path $packageRoot "AGENTS-GOMR.md") $agentsPath -Force

Write-Host "Installed global GOMR into $target"
Write-Host "Restart OpenCode. Each project will get its own .orca-memory when OpenCode runs there."
Write-Host "Optional per-project init: node --no-warnings .opencode/gomr/memory-index.ts init ."
