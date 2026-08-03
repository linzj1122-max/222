[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^git@github\.com:[^/]+/[^/]+(?:\.git)?$')]
  [string]$Repository,

  [Parameter(Mandatory = $true)]
  [string]$GitUserName,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[^@\s]+@[^@\s]+$')]
  [string]$GitUserEmail,

  [string]$Branch = 'main',

  [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\id_ed25519_github_222')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

foreach ($command in @('git', 'ssh', 'ssh-keygen')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required command is not available: $command"
  }
}

$keyDirectory = Split-Path -Parent $KeyPath
if (-not (Test-Path -LiteralPath $keyDirectory)) {
  New-Item -ItemType Directory -Path $keyDirectory | Out-Null
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
  # Windows PowerShell 5 drops a truly empty native argument. Passing two
  # quotes preserves an empty passphrase for OpenSSH without prompting.
  & ssh-keygen -q -t ed25519 -C $GitUserEmail -f $KeyPath -N '""'
  if ($LASTEXITCODE -ne 0) { throw 'SSH key generation failed.' }
  Write-Host "Created project SSH key: $KeyPath"
} else {
  Write-Host "Using existing project SSH key: $KeyPath"
}

Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.git'))) {
    & git init -b $Branch
    if ($LASTEXITCODE -ne 0) { throw 'Git initialization failed.' }
  }

  & git config --local user.name $GitUserName
  & git config --local user.email $GitUserEmail
  & git config --local core.hooksPath '.githooks'

  $sshKeyForGit = $KeyPath.Replace('\', '/')
  $knownHostsForGit = (Join-Path $keyDirectory 'known_hosts').Replace('\', '/')
  & git config --local core.sshCommand "ssh -i `"$sshKeyForGit`" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=`"$knownHostsForGit`""

  $remotes = @(& git remote)
  if ($remotes -contains 'origin') {
    & git remote set-url origin $Repository
  } else {
    & git remote add origin $Repository
  }

  & git branch -M $Branch
  & git config --local "branch.$Branch.remote" origin
  & git config --local "branch.$Branch.merge" "refs/heads/$Branch"
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Add this PUBLIC key to GitHub (Settings -> SSH and GPG keys):' -ForegroundColor Cyan
Get-Content -Raw -LiteralPath "$KeyPath.pub"
Write-Host 'After adding it, run:' -ForegroundColor Cyan
Write-Host ".\scripts\publish.ps1 -Message `"Initial import`""
