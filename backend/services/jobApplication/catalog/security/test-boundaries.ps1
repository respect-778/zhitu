#Requires -Version 7.0
# Regression tests use isolated, generated files. No business tree is scanned.
[CmdletBinding()]
param([string]$ToolsRoot = 'D:\knownai\outputs\job-catalog-handoff-2026-11-08\evidence\2026-11-09\security-tools')
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$stage = 'boundary-test-initialization'
try {
    . (Join-Path $PSScriptRoot 'path-safety.ps1')
    $ToolsRoot = Get-AuditSafePath -Path $ToolsRoot -Kind Directory -MustExist
    $testRoot = New-AuditSafeDirectory -Path (Join-Path $ToolsRoot ('regression-sandboxes/' + [guid]::NewGuid().ToString('N'))) -Root $ToolsRoot
    $manifest = Get-Content -LiteralPath (Get-AuditSafePath -Path (Join-Path $ToolsRoot 'tools-manifest.json') -Root $ToolsRoot -Kind File -MustExist) -Raw
    $runner = Get-AuditSafePath -Path (Join-Path $PSScriptRoot 'invoke-local-scan.ps1') -Kind File -MustExist
    $receipts = [Collections.Generic.List[object]]::new()
    function New-Case([string]$Name, [switch]$WithoutManifest) {
        $caseRoot = New-AuditSafeDirectory -Path (Join-Path $testRoot $Name) -Root $testRoot
        $toolPath = New-AuditSafeDirectory -Path (Join-Path $caseRoot 'tools') -Root $testRoot
        $inputPath = New-AuditSafeDirectory -Path (Join-Path $toolPath 'review-inputs/source') -Root $testRoot
        Write-AuditText -Path (Join-Path $inputPath 'clean.ts') -Root $testRoot -Text 'export const value = 1;'
        if (!$WithoutManifest) { Write-AuditText -Path (Join-Path $toolPath 'tools-manifest.json') -Root $testRoot -Text $manifest }
        return @{ root = $caseRoot; tools = $toolPath; source = $inputPath }
    }
    function Invoke-Case([string]$Name, [string]$Script, [string[]]$Arguments, [int]$ExpectedExit) {
        $stdout = Get-AuditSafePath -Path (Join-Path $testRoot ($Name + '.stdout.json')) -Root $testRoot -Kind File
        $stderr = Get-AuditSafePath -Path (Join-Path $testRoot ($Name + '.stderr.json')) -Root $testRoot -Kind File
        & pwsh -NoProfile -File $Script @Arguments 1> $stdout 2> $stderr
        $actualExit = $LASTEXITCODE
        if ($actualExit -ne $ExpectedExit) { throw "Unexpected boundary test exit: $Name" }
        $expectedStages = @{ 'missing-manifest' = 'manifest'; 'hash-failure' = 'integrity'; 'create-failure' = 'semgrep-create'; 'pat-ignore-rejected' = 'preflight'; 'junction-reports' = 'report-directory'; 'junction-bin' = 'integrity'; 'junction-cache' = 'integrity'; 'junction-cache-nested' = 'integrity'; 'junction-prepare-bin' = 'prepare-paths'; 'junction-prepare-cache' = 'prepare-paths'; 'junction-self-test-inputs' = 'self-test-paths' }
        if ($expectedStages.ContainsKey($Name)) {
            $errorEnvelope = Get-Content -LiteralPath $stderr -Raw | ConvertFrom-Json
            if ($errorEnvelope.status -ne 'scanner_error' -or $errorEnvelope.stage -ne $expectedStages[$Name]) { throw "Failure came from the wrong boundary: $Name" }
        }
        $receipts.Add([ordered]@{ test = $Name; expectedExit = $ExpectedExit; actualExit = $actualExit; stdout = $stdout; stderr = $stderr })
        return @{ stdout = $stdout; stderr = $stderr }
    }
    function Invoke-ScanCase([string]$Name, [hashtable]$Case, [string]$Scanner, [int]$ExpectedExit = 2) {
        return Invoke-Case $Name $runner @('-ToolsRoot', $Case.tools, '-SourceRoot', $Case.source, '-Scanner', $Scanner, '-Label', $Name) $ExpectedExit
    }
    $stage = 'boundary-missing-manifest'
    $case = New-Case 'missing-manifest' -WithoutManifest
    $null = Invoke-ScanCase 'missing-manifest' $case 'semgrep'
    $stage = 'boundary-hash-failure'
    $case = New-Case 'hash-failure'
    $null = New-AuditSafeDirectory -Path (Join-Path $case.tools 'bin') -Root $testRoot
    Write-AuditText -Path (Join-Path $case.tools 'bin/gitleaks') -Root $testRoot -Text 'deliberately mismatched fixture bytes'
    $null = Invoke-ScanCase 'hash-failure' $case 'gitleaks'
    $stage = 'boundary-create-failure'
    $case = New-Case 'create-failure'
    $config = $manifest | ConvertFrom-Json
    $config.semgrepImage = 'semgrep/semgrep@sha256:' + ('0' * 64)
    Write-AuditText -Path (Join-Path $case.tools 'tools-manifest.json') -Root $testRoot -Text ($config | ConvertTo-Json)
    $null = Invoke-ScanCase 'create-failure' $case 'semgrep'
    $stage = 'boundary-gitleaks-error-with-json'
    $case = New-Case 'gitleaks-error-with-json'
    $null = New-AuditSafeDirectory -Path (Join-Path $case.tools 'bin') -Root $testRoot
    # This explicitly synthetic scanner double reproduces failure after a partial report.
    $stub = "#!/bin/sh`nprintf '%s\n' '[{`"RuleID`":`"github-pat`",`"Secret`":`"REDACTED`"}]' > /out/gitleaks.json`nexit 1`n"
    $stubPath = Join-Path $case.tools 'bin/gitleaks'
    Write-AuditText -Path $stubPath -Root $testRoot -Text $stub
    $config = $manifest | ConvertFrom-Json
    $config.gitleaksBinarySha256 = (Get-FileHash -LiteralPath $stubPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-AuditText -Path (Join-Path $case.tools 'tools-manifest.json') -Root $testRoot -Text ($config | ConvertTo-Json)
    $failureRun = Invoke-ScanCase 'gitleaks-error-with-json' $case 'gitleaks'
    $failureSummary = Get-Content -LiteralPath $failureRun.stdout -Raw | ConvertFrom-Json
    if ($failureSummary.results[0].status -ne 'scanner_error' -or $failureSummary.results[0].exitCode -ne 1) { throw 'JSON plus scanner exit 1 must remain an error.' }
    $stage = 'boundary-ignore-fingerprint'
    $patSource = New-AuditSafeDirectory -Path (Join-Path $ToolsRoot ('review-inputs/ignore-regression-' + [guid]::NewGuid().ToString('N'))) -Root $ToolsRoot
    Write-AuditText -Path (Join-Path $patSource 'clean.ts') -Root $ToolsRoot -Text 'export const value = 1;'
    $patCase = @{ tools = $ToolsRoot; source = $patSource }
    $null = Invoke-ScanCase 'clean-control' $patCase 'gitleaks' 0
    Write-AuditText -Path (Join-Path $patSource 'synthetic-token.txt') -Root $ToolsRoot -Text ('SYNTHETIC_TOKEN=ghp_' + 'A9b8C7d6E5f4G3h2I1j0K9l8M7n6P5q4R3s2')
    $control = Invoke-ScanCase 'pat-control' $patCase 'gitleaks' 1
    $controlSummary = Get-Content -LiteralPath $control.stdout -Raw | ConvertFrom-Json
    if ($controlSummary.results[0].exitCode -ne 10) { throw 'Real Gitleaks finding did not exit 10.' }
    $patReport = Get-Content -LiteralPath (Get-AuditSafePath -Path $controlSummary.results[0].report -Root $ToolsRoot -Kind File -MustExist) -Raw | ConvertFrom-Json
    Write-AuditText -Path (Join-Path $patSource '.gitleaksignore') -Root $ToolsRoot -Text $patReport[0].Fingerprint
    $null = Invoke-ScanCase 'pat-ignore-rejected' $patCase 'gitleaks'
    $stage = 'boundary-reparse'
    foreach ($variant in @('reports', 'bin', 'cache', 'cache-nested', 'prepare-bin', 'prepare-cache', 'self-test-inputs')) {
        $case = New-Case ('junction-' + $variant)
        $outside = New-AuditSafeDirectory -Path (Join-Path $case.root 'outside-tool-root') -Root $testRoot
        Write-AuditText -Path (Join-Path $outside 'sentinel.txt') -Root $testRoot -Text 'must remain unchanged'
        $linkRelative = switch ($variant) { 'cache-nested' { 'cache/osv-scalibr/npm/nested-link' }; 'prepare-bin' { 'bin' }; 'prepare-cache' { 'cache' }; 'self-test-inputs' { 'new-review-inputs' }; default { $variant } }
        if ($variant -in @('cache', 'cache-nested')) {
            $null = New-AuditSafeDirectory -Path (Join-Path $case.tools 'bin') -Root $testRoot
            $stubPath = Join-Path $case.tools 'bin/osv-scanner'
            Write-AuditText -Path $stubPath -Root $testRoot -Text 'never execute this path-validation fixture'
            $config = $manifest | ConvertFrom-Json
            $config.osvBinarySha256 = (Get-FileHash -LiteralPath $stubPath -Algorithm SHA256).Hash.ToLowerInvariant()
            Write-AuditText -Path (Join-Path $case.tools 'tools-manifest.json') -Root $testRoot -Text ($config | ConvertTo-Json)
        }
        if ($variant -eq 'self-test-inputs') {
            # A dedicated root avoids moving or modifying any existing review-inputs directory.
            $case.tools = New-AuditSafeDirectory -Path (Join-Path $case.root 'self-test-tools') -Root $testRoot
            $linkRelative = 'review-inputs'
        }
        $linkPath = Get-AuditSafePath -Path (Join-Path $case.tools $linkRelative) -Root $testRoot
        $null = New-AuditSafeDirectory -Path (Split-Path -Parent $linkPath) -Root $testRoot
        New-Item -ItemType Junction -Path $linkPath -Target $outside | Out-Null
        try {
            switch ($variant) {
                { $_ -like 'prepare-*' } { $null = Invoke-Case ('junction-' + $variant) (Join-Path $PSScriptRoot 'prepare-tools.ps1') @('-ToolsRoot', $case.tools) 2 }
                'self-test-inputs' { $null = Invoke-Case ('junction-' + $variant) (Join-Path $PSScriptRoot 'self-test.ps1') @('-ToolsRoot', $case.tools) 2 }
                default { $scannerName = if ($variant -in @('cache', 'cache-nested')) { 'osv' } elseif ($variant -eq 'bin') { 'gitleaks' } else { 'semgrep' }; $null = Invoke-ScanCase ('junction-' + $variant) $case $scannerName }
            }
            $outsideItems = @(Get-ChildItem -LiteralPath $outside -Force)
            if ($outsideItems.Count -ne 1 -or (Get-Content -LiteralPath (Join-Path $outside 'sentinel.txt') -Raw) -ne 'must remain unchanged') { throw 'Reparse test modified the outside target.' }
        } finally {
            # Remove only this verified test junction, without recursion or deleting its target.
            $fullLink = [IO.Path]::GetFullPath($linkPath)
            if (!(Test-AuditWithin $fullLink $testRoot) -or !(Test-AuditWithin ([IO.Path]::GetFullPath($outside)) $testRoot)) { throw 'Unsafe test-junction cleanup boundary.' }
            $linkItem = Get-Item -LiteralPath $fullLink -Force
            if (!($linkItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Expected the test junction during cleanup.' }
            Remove-Item -LiteralPath $fullLink -Force
        }
    }
    $receipt = [ordered]@{ status = 'passed_boundary_regressions'; recordedAt = (Get-Date).ToUniversalTime().ToString('o'); testRoot = $testRoot; tests = $receipts; scannerFailureCase = 'Synthetic scanner double with partial JSON and exit 1; real timeout was not forced.' }
    Write-AuditText -Path (Join-Path $testRoot 'receipt.json') -Root $ToolsRoot -Text ($receipt | ConvertTo-Json -Depth 6)
    $receipt | ConvertTo-Json -Depth 6
    exit 0
} catch {
    if (Get-Command Write-AuditFailure -ErrorAction SilentlyContinue) { Write-AuditFailure -Stage $stage -ToolsRoot $ToolsRoot -ErrorType $_.Exception.GetType().Name }
    else { [Console]::Error.WriteLine('{"status":"scanner_error","stage":"initialization"}') }
    exit 2
}
