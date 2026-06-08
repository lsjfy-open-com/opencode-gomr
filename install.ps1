param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectPath
)

$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = (Resolve-Path $ProjectPath).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Copy-GomrPath($relativePath) {
  $source = Join-Path $packageRoot $relativePath
  $destination = Join-Path $target $relativePath
  if (Test-Path $destination) {
    Rename-Item $destination "$destination.backup-$stamp"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Copy-Item $source $destination -Recurse -Force
}

Copy-GomrPath ".opencode\gomr"
Copy-GomrPath ".opencode\plugins\gomr.ts"
Copy-GomrPath ".opencode\agents\context-router.md"
Copy-GomrPath ".opencode\skills\context-path-builder"

$agentsPath = Join-Path $target "AGENTS.md"
$gomrSection = Get-Content -Raw (Join-Path $packageRoot "AGENTS-GOMR.md")

if (!(Test-Path $agentsPath)) {
  Set-Content -Path $agentsPath -Value $gomrSection -Encoding UTF8
} elseif (!((Get-Content -Raw $agentsPath) -like "*Goal-Oriented Memory Runtime (GOMR)*")) {
  Add-Content -Path $agentsPath -Value "`n$gomrSection" -Encoding UTF8
}

Write-Host "Installed GOMR into $target"
Write-Host "Next: restart OpenCode and run: node --no-warnings .opencode/gomr/memory-index.ts init ."
