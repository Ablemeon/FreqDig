<#
  FreqDig
  Copyright (c) 2026 Diggercat (挖煤猫)
  SPDX-License-Identifier: MIT
#>

param(
  [int]$Port = 8000
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is required to run the local server. Download it from https://nodejs.org/"
  exit 1
}

node scripts/static-server.mjs $Port --open
