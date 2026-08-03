[CmdletBinding()]
param(
  [string]$Message = "Update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot

try {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
    throw 'Git is not configured. Run scripts/setup-github-ssh.ps1 first.'
  }

  $branch = (& git branch --show-current).Trim()
  if (-not $branch) { throw 'Cannot publish from a detached HEAD.' }
  if ($branch -ne 'main') { throw "Publishing is restricted to main; current branch is $branch." }

  & git remote get-url origin | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Git remote origin is not configured.' }

  & git add -A
  if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }

  $stagedNames = @(& git diff --cached --name-only)
  $blockedNames = @($stagedNames | Where-Object {
    $_ -match '(^|/)(\.dev\.vars|\.env(?:\..*)?|id_[^/]*|[^/]*\.(?:pem|key))$'
  })
  if ($blockedNames.Count -gt 0) {
    & git reset -- $blockedNames | Out-Null
    throw "Refusing to commit possible secrets: $($blockedNames -join ', ')"
  }

  if (-not $stagedNames.Count) {
    Write-Host 'No changes to publish.'
    exit 0
  }

  $stagedPatch = (& git diff --cached --no-ext-diff -U0) -join "`n"
  if ($stagedPatch -match 'BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY') {
    throw 'Refusing to commit a private key found in the staged diff.'
  }

  $env:SKIP_AUTO_PUSH = '1'
  try {
    & git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
  } finally {
    Remove-Item Env:SKIP_AUTO_PUSH -ErrorAction SilentlyContinue
  }

  & git push -u origin 'HEAD:main'
  if ($LASTEXITCODE -ne 0) {
    throw 'Push failed. The commit is safe locally; fix SSH/network access and run git push origin main.'
  }

  Write-Host 'Published to GitHub. Cloudflare Pages should now start a deployment.' -ForegroundColor Green
} finally {
  Pop-Location
}
