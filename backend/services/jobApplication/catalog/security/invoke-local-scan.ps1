#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$ToolsRoot = 'D:\knownai\outputs\job-catalog-handoff-2026-11-08\evidence\2026-11-09\security-tools',
    [string[]]$Scanner = @('semgrep', 'gitleaks', 'osv'),
    [string]$Label = 'catalog'
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$stage = 'initialization'
try {
. (Join-Path $PSScriptRoot 'path-safety.ps1')
$stage = 'preflight'
if (!$Scanner.Count -or @($Scanner | Where-Object { $_ -notin @('semgrep', 'gitleaks', 'osv') }).Count -or $Label -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$') { throw 'Invalid scanner selection or label.' }

function Get-LocalDirectory([string]$Path) {
    return Get-AuditSafePath -Path $Path -Kind Directory -MustExist
}
function Test-Within([string]$Path, [string]$Root) {
    return Test-AuditWithin $Path $Root
}
function Assert-Hash([string]$Path, [string]$Expected) {
    $Path = Get-AuditSafePath -Path $Path -Root $ToolsRoot -Kind File -MustExist
    if ($Expected -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Expected) {
        throw "Hash mismatch or missing pinned hash: $Path"
    }
}

$SourceRoot = Get-LocalDirectory $SourceRoot
$ToolsRoot = Get-LocalDirectory $ToolsRoot
$catalogRoot = Get-LocalDirectory (Split-Path -Parent $PSScriptRoot)
$stagingRoot = Get-AuditSafePath -Path (Join-Path $ToolsRoot 'review-inputs') -Root $ToolsRoot -Kind Directory
if (!(Test-Within $SourceRoot $catalogRoot) -and !(Test-Within $SourceRoot $stagingRoot)) {
    throw 'SourceRoot must be catalog (or its child) or an explicitly staged package under ToolsRoot/review-inputs. Never mount the repository root or home.'
}
$sourceItems = @(Get-AuditSafeTree -Path $SourceRoot)
# v8.30.1 loads source/.gitleaksignore even with --gitleaks-ignore-path set.
if (@($sourceItems | Where-Object Name -eq '.gitleaksignore').Count) { throw 'Target .gitleaksignore is forbidden; stage reviewed code without suppression files.' }
$sensitiveFiles = @($sourceItems | Where-Object {
    !$_.PSIsContainer -and ($_.Name -eq '.env' -or ($_.Name -like '.env.*' -and $_.Name -notin @('.env.example', '.env.sample', '.env.template')) -or $_.Name -match '^(id_rsa|id_ed25519|credentials)$' -or $_.Extension -in @('.pem', '.p12', '.pfx', '.key'))
})
if ($sensitiveFiles.Count) { throw 'Potential credential files found. Stage code without credentials in ToolsRoot/review-inputs before scanning.' }
$stage = 'manifest'
$manifestPath = Get-AuditSafePath -Path (Join-Path $ToolsRoot 'tools-manifest.json') -Root $ToolsRoot -Kind File -MustExist
$toolConfig = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($toolConfig.alpineImage -notmatch '^alpine@sha256:[a-f0-9]{64}$' -or $toolConfig.semgrepImage -notmatch '^semgrep/semgrep@sha256:[a-f0-9]{64}$') {
    throw 'Only digest-pinned official Alpine and Semgrep images are accepted.'
}
$stage = 'integrity'
if ('gitleaks' -in $Scanner) { Assert-Hash (Join-Path $ToolsRoot 'bin/gitleaks') $toolConfig.gitleaksBinarySha256 }
if ('osv' -in $Scanner) {
    Assert-Hash (Join-Path $ToolsRoot 'bin/osv-scanner') $toolConfig.osvBinarySha256
    $null = @(Get-AuditSafeTree -Path (Join-Path $ToolsRoot 'cache') -Root $ToolsRoot)
    Assert-Hash (Join-Path $ToolsRoot 'cache/osv-scalibr/npm/all.zip') $toolConfig.npmDatabaseSha256
}
$stage = 'report-directory'
$reportRoot = New-AuditSafeDirectory -Path (Join-Path $ToolsRoot ('reports/' + $Label + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))) -Root $ToolsRoot
function Get-ReportPath([string]$Name) { return Get-AuditSafePath -Path (Join-Path $reportRoot $Name) -Root $reportRoot -Kind File }
$sourceItems | Where-Object { !$_.PSIsContainer } | ForEach-Object {
    $safeFile = Get-AuditSafePath -Path $_.FullName -Root $SourceRoot -Kind File -MustExist
    [ordered]@{ path = [IO.Path]::GetRelativePath($SourceRoot, $safeFile); sha256 = (Get-FileHash -LiteralPath $safeFile -Algorithm SHA256).Hash.ToLowerInvariant() }
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Get-ReportPath 'source-manifest.json') -Encoding utf8
$rulesRoot = Get-LocalDirectory (Join-Path $PSScriptRoot 'rules')
Get-AuditSafeTree -Path $rulesRoot | Where-Object { !$_.PSIsContainer } | ForEach-Object {
    [ordered]@{ path = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
} | ConvertTo-Json | Set-Content -LiteralPath (Get-ReportPath 'rules-manifest.json') -Encoding utf8
$results = [Collections.Generic.List[object]]::new()

foreach ($scan in $Scanner) {
    $stage = "$scan-mount-validation"
    foreach ($directory in @($SourceRoot, $rulesRoot, $reportRoot)) { $null = @(Get-AuditSafeTree -Path $directory) }
    if ($scan -eq 'gitleaks') { $null = Get-AuditSafePath -Path (Join-Path $ToolsRoot 'bin/gitleaks') -Root $ToolsRoot -Kind File -MustExist }
    if ($scan -eq 'osv') {
        $null = Get-AuditSafePath -Path (Join-Path $ToolsRoot 'bin/osv-scanner') -Root $ToolsRoot -Kind File -MustExist
        $null = @(Get-AuditSafeTree -Path (Join-Path $ToolsRoot 'cache') -Root $ToolsRoot)
    }
    $containerName = 'catalog-audit-' + [guid]::NewGuid().ToString('N')
    $common = @('create', '--name', $containerName, '--pull=never', '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--user', '65532:65532', '--read-only', '--pids-limit', '128', '--cpus', '2', '--memory', '2g', '--memory-swap', '2g', '--tmpfs', '/tmp:rw,noexec,nosuid,size=256m', '--workdir', '/tmp', '--env', 'HOME=/tmp', '--env', 'XDG_CACHE_HOME=/tmp/cache', '--mount', "type=bind,source=$SourceRoot,target=/src,readonly", '--mount', "type=bind,source=$rulesRoot,target=/rules,readonly", '--mount', "type=bind,source=$reportRoot,target=/out")
    switch ($scan) {
        'semgrep' {
            $arguments = $common + @('--env', 'SEMGREP_SEND_METRICS=off', '--env', 'SEMGREP_ENABLE_VERSION_CHECK=0', '--env', 'SEMGREP_SETTINGS_FILE=/tmp/semgrep-settings.yml', '--entrypoint', 'semgrep', $toolConfig.semgrepImage, 'scan', '--config', '/rules/catalog.yml', '--metrics=off', '--disable-version-check', '--disable-nosem', '--no-git-ignore', '--x-ignore-semgrepignore-files', '--exclude', 'node_modules', '--exclude', '.git', '--exclude', 'dist', '--exclude', 'security', '--jobs', '2', '--timeout', '15', '--max-memory', '512', '--max-target-bytes', '2000000', '--json', '--output', '/out/semgrep.json', '--error', '/src')
        }
        'gitleaks' {
            $arguments = $common + @('--mount', "type=bind,source=$ToolsRoot\bin\gitleaks,target=/tools/gitleaks,readonly", '--entrypoint', '/tools/gitleaks', $toolConfig.alpineImage, 'dir', '/src', '--config', '/rules/gitleaks.toml', '--gitleaks-ignore-path', '/rules/empty.gitleaksignore', '--ignore-gitleaks-allow', '--redact=100', '--exit-code', '10', '--no-banner', '--no-color', '--timeout', '180', '--report-format', 'json', '--report-path', '/out/gitleaks.json')
        }
        'osv' {
            $arguments = $common + @('--mount', "type=bind,source=$ToolsRoot\bin\osv-scanner,target=/tools/osv-scanner,readonly", '--mount', "type=bind,source=$ToolsRoot\cache,target=/cache,readonly", '--env', 'OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=/cache', '--entrypoint', '/tools/osv-scanner', $toolConfig.alpineImage, 'scan', 'source', '--offline', '--no-resolve', '--no-call-analysis=go,rust', '--config', '/rules/osv-scanner.toml', '--recursive', '--no-ignore', '--x-exclude', 'node_modules', '--x-exclude', '.git', '--format', 'json', '--output-file', '/out/osv.json', '/src')
        }
    }
    $arguments | ConvertTo-Json | Set-Content -LiteralPath (Get-ReportPath "$scan-command.json") -Encoding utf8
    $stage = "$scan-create"
    $containerId = (& docker @arguments 2> (Get-ReportPath "$scan-create.stderr.log") | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $containerId -notmatch '^[a-f0-9]{64}$') { throw "Failed to create $scan container. See $reportRoot" }
    try {
        $stage = "$scan-execute"
        $inspectText = & docker inspect $containerId
        if ($LASTEXITCODE -ne 0) { throw "Cannot inspect $scan container." }
        $inspectText | Set-Content -LiteralPath (Get-ReportPath "$scan-container.json") -Encoding utf8
        & docker start --attach $containerId 1> (Get-ReportPath "$scan.stdout.log") 2> (Get-ReportPath "$scan.stderr.log")
        $state = & docker inspect --format '{{json .State}}' $containerId
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect scanner exit state.' }
        $parsedState = $state | ConvertFrom-Json
        if ($parsedState.Running -or $parsedState.OOMKilled -or $parsedState.Error) { throw 'Scanner did not terminate normally.' }
        $exitCode = [int]$parsedState.ExitCode
        $state | Set-Content -LiteralPath (Get-ReportPath "$scan-state.json") -Encoding utf8
        $reportFile = Get-ReportPath "$scan.json"
        $findingExit = if ($scan -eq 'gitleaks') { 10 } else { 1 }
        $status = if ($exitCode -eq 0) { 'no_findings_in_scope' } elseif ($exitCode -eq $findingExit) { 'review_required' } else { 'scanner_error' }
        if (!(Test-Path -LiteralPath $reportFile)) { $status = 'scanner_error' }
        if (Test-Path -LiteralPath $reportFile) {
            try {
                $reportData = Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json -NoEnumerate
                if ($scan -eq 'semgrep' -and @($reportData.errors).Count -gt 0) { $status = 'scanner_error' }
                if ($scan -eq 'gitleaks' -and (($exitCode -eq 10 -and @($reportData).Count -eq 0) -or ($exitCode -eq 0 -and @($reportData).Count -gt 0))) { $status = 'scanner_error' }
            } catch { $status = 'scanner_error' }
        }
        $results.Add([ordered]@{ scanner = $scan; exitCode = $exitCode; status = $status; report = $reportFile })
    } finally {
        & docker rm --force $containerId 1> (Get-ReportPath "$scan-cleanup.log") 2>&1
    }
}
$summary = [ordered]@{ sourceRoot = $SourceRoot; finishedAt = (Get-Date).ToUniversalTime().ToString('o'); reportRoot = $reportRoot; offline = $true; results = $results; limitations = 'Local heuristic SAST + current-file secret detection + cached npm advisories only. No Git history, malicious-package classifier, runtime behavior trace, exploitability proof or final approval. Review all skips/errors and every finding.' }
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Get-ReportPath 'summary.json') -Encoding utf8
$summary | ConvertTo-Json -Depth 8
if (@($results | Where-Object status -eq 'scanner_error').Count) { exit 2 }
if (@($results | Where-Object status -eq 'review_required').Count) { exit 1 }
exit 0
} catch {
    if (Get-Command Write-AuditFailure -ErrorAction SilentlyContinue) { Write-AuditFailure -Stage $stage -ToolsRoot $ToolsRoot -ErrorType $_.Exception.GetType().Name }
    else { [Console]::Error.WriteLine('{"status":"scanner_error","stage":"initialization"}') }
    exit 2
}
