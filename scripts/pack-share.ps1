# Creates a shareable zip. Backend credentials are excluded by default.
# Usage (from repo root, PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts/pack-share.ps1
# To include the shared backend environment:
#   powershell -ExecutionPolicy Bypass -File scripts/pack-share.ps1 -IncludeBackendEnv

param(
  [switch]$IncludeBackendEnv
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "package.json"))) {
  $root = Get-Location
}
$out = Join-Path $root "credit-card-platform-share.zip"
if (Test-Path $out) { Remove-Item $out -Force }

$excludeDirNames = @(
  "node_modules", ".git", ".cursor", "dist", "build", "generated",
  ".secrets", "agent-transcripts", "terminals"
)
$excludeFileNames = @(".DS_Store", "Thumbs.db")
$excludeExt = @(".zip", ".log")

$files = Get-ChildItem -Path $root -Recurse -File -Force | Where-Object {
  $rel = $_.FullName.Substring($root.Length).TrimStart("\", "/")
  $parts = $rel -split "[\\/]"
  $blockedDir = $false
  foreach ($p in $parts[0..($parts.Length - 2)]) {
    if ($excludeDirNames -contains $p) { $blockedDir = $true; break }
  }
  if ($blockedDir) { return $false }
  if ($excludeFileNames -contains $_.Name) { return $false }
  if ($_.Name -eq ".env") {
    $isSharedBackendEnv = $rel -eq "backend\.env"
    if (-not ($IncludeBackendEnv -and $isSharedBackendEnv)) { return $false }
  }
  if ($excludeExt -contains $_.Extension.ToLowerInvariant()) { return $false }
  if ($_.Name -like ".env.*" -and $_.Name -ne ".env.example") { return $false }
  return $true
}

if ($IncludeBackendEnv -and -not (Test-Path (Join-Path $root "backend\.env") -PathType Leaf)) {
  throw "Cannot include backend\.env because it does not exist."
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
  $out,
  [System.IO.Compression.ZipArchiveMode]::Create
)
try {
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length).TrimStart("\", "/").Replace("\", "/")
    $entry = $archive.CreateEntry(
      $rel,
      [System.IO.Compression.CompressionLevel]::Optimal
    )
    $sourceStream = [System.IO.File]::OpenRead($f.FullName)
    $entryStream = $entry.Open()
    try {
      $sourceStream.CopyTo($entryStream)
    }
    finally {
      $entryStream.Dispose()
      $sourceStream.Dispose()
    }
  }
}
finally {
  $archive.Dispose()
}

  $sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 2)
  Write-Host "Created: $out ($sizeMb MB)"
  Write-Host "Share SETUP.md with recipients."
  if ($IncludeBackendEnv) {
    Write-Warning "This archive contains backend\.env credentials and grants access to its configured database."
  }
