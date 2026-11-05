# Package ELION IPTV as a webOS IPK (requires LG ares-cli)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "dist"

Write-Host "Validating package prerequisites..."
node (Join-Path $PSScriptRoot "validate-package.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Get-Command ares-package -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "ares-package not found on PATH."
  Write-Host "Install webOS TV CLI:"
  Write-Host "  https://webostv.developer.lge.com/develop/tools/cli-installation"
  Write-Host "Full steps: docs\WEBOS_BUILD.md"
  Write-Host ""
  Write-Host "After install, re-run this script. Expected IPK:"
  Write-Host "  dist\com.elion.iptv_1.0.0_all.ipk"
  exit 1
}

New-Item -ItemType Directory -Force -Path $out | Out-Null

# Exclude non-TV assets from the package
ares-package $root -o $out -n `
  -e "companion" `
  -e "dist" `
  -e "scripts" `
  -e "tests" `
  -e "docs" `
  -e "sample" `
  -e "node_modules" `
  -e ".git" `
  -e "ANALYSIS.md" `
  -e "FINAL_REPORT.md"

Write-Host ""
Write-Host "Done. IPK files in $out"
Get-ChildItem $out -Filter *.ipk | Format-Table Name, Length, LastWriteTime
