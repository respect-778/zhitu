#Requires -Version 7.0
# Online preparation only: no project mounts, package installation or project execution.
[CmdletBinding()]
param([string]$ToolsRoot = 'D:\knownai\outputs\job-catalog-handoff-2026-11-08\evidence\2026-11-09\security-tools')
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$stage = 'initialization'
try {
. (Join-Path $PSScriptRoot 'path-safety.ps1')
$stage = 'prepare-paths'
$ToolsRoot = Get-AuditSafePath -Path $ToolsRoot -Kind Directory
foreach ($relative in @('bin', 'bin/gitleaks', 'bin/osv-scanner', 'bin/osv-scanner.partial', 'cache', 'cache/osv-scalibr/npm', 'cache/osv-scalibr/npm/all.zip', 'cache/osv-scalibr/npm/all.zip.partial', 'gitleaks_8.30.1_linux_x64.tar.gz', 'gitleaks_8.30.1_linux_x64.tar.gz.partial', 'tools-manifest.json')) {
    $null = Get-AuditSafePath -Path (Join-Path $ToolsRoot $relative) -Root $ToolsRoot
}
foreach ($relative in @('bin', 'cache')) {
    $directory = Get-AuditSafePath -Path (Join-Path $ToolsRoot $relative) -Root $ToolsRoot -Kind Directory
    if (Test-Path -LiteralPath $directory) { $null = @(Get-AuditSafeTree -Path $directory -Root $ToolsRoot) }
}
$ToolsRoot = New-AuditSafeDirectory -Path $ToolsRoot
$null = New-AuditSafeDirectory -Path (Join-Path $ToolsRoot 'bin') -Root $ToolsRoot
$null = New-AuditSafeDirectory -Path (Join-Path $ToolsRoot 'cache/osv-scalibr/npm') -Root $ToolsRoot
function Get-VerifiedFile([string]$Url, [string]$Path, [string]$ExpectedHash) {
    $Path = Get-AuditSafePath -Path $Path -Root $ToolsRoot -Kind File
    $partialPath = Get-AuditSafePath -Path ($Path + '.partial') -Root $ToolsRoot -Kind File
    if (!(Test-Path -LiteralPath $Path)) {
        & curl.exe --fail --silent --show-error --location --retry 2 --connect-timeout 20 --max-time 600 --output $partialPath $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
        $partialPath = Get-AuditSafePath -Path $partialPath -Root $ToolsRoot -Kind File -MustExist
        $Path = Get-AuditSafePath -Path $Path -Root $ToolsRoot -Kind File
        Move-Item -LiteralPath $partialPath -Destination $Path
    }
    $Path = Get-AuditSafePath -Path $Path -Root $ToolsRoot -Kind File -MustExist
    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ExpectedHash -and $actualHash -ne $ExpectedHash) { throw "Official release hash mismatch: $Path" }
    return $actualHash
}
$osvUrl = 'https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_linux_amd64'
$gitleaksUrl = 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz'
$dbUrl = 'https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip'
$stage = 'prepare-downloads'
$osvHash = Get-VerifiedFile $osvUrl (Join-Path $ToolsRoot 'bin/osv-scanner') '160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b'
$archivePath = Join-Path $ToolsRoot 'gitleaks_8.30.1_linux_x64.tar.gz'
$archiveHash = Get-VerifiedFile $gitleaksUrl $archivePath '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
$stage = 'prepare-extraction'
$null = @(Get-AuditSafeTree -Path (Join-Path $ToolsRoot 'bin') -Root $ToolsRoot)
$null = Get-AuditSafePath -Path (Join-Path $ToolsRoot 'bin/gitleaks') -Root $ToolsRoot -Kind File
& tar -xzf $archivePath -C (Join-Path $ToolsRoot 'bin') gitleaks
if ($LASTEXITCODE -ne 0) { throw 'Cannot extract verified gitleaks binary.' }
$gitleaksHash = (Get-FileHash -LiteralPath (Get-AuditSafePath -Path (Join-Path $ToolsRoot 'bin/gitleaks') -Root $ToolsRoot -Kind File -MustExist) -Algorithm SHA256).Hash.ToLowerInvariant()
$dbPath = Join-Path $ToolsRoot 'cache/osv-scalibr/npm/all.zip'
$dbHash = Get-VerifiedFile $dbUrl $dbPath ''
$archive = [IO.Compression.ZipFile]::OpenRead((Get-AuditSafePath -Path $dbPath -Root $ToolsRoot -Kind File -MustExist))
try { $dbEntries = $archive.Entries.Count; if ($dbEntries -lt 1) { throw 'OSV database zip is empty.' } } finally { $archive.Dispose() }
$alpineImage = 'alpine@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc'
$semgrepImage = 'semgrep/semgrep@sha256:cc1b68266f267878b39739373ea9985b9a78e5d64497dd875c8de100b22695ed'
foreach ($image in @($alpineImage, $semgrepImage)) {
    $stage = 'prepare-images'
    & docker image inspect $image 1> $null 2> $null
    if ($LASTEXITCODE -ne 0) {
        & docker pull $image
        if ($LASTEXITCODE -ne 0) { throw "Cannot obtain pinned official image: $image" }
    }
}
$manifest = [ordered]@{
    preparedAt = (Get-Date).ToUniversalTime().ToString('o')
    platform = 'linux/amd64'
    alpineImage = $alpineImage
    semgrepImage = $semgrepImage
    semgrepVersion = '1.184.0'
    gitleaksVersion = '8.30.1'
    osvVersion = '2.7.0'
    osvSource = $osvUrl
    gitleaksSource = $gitleaksUrl
    osvBinarySha256 = $osvHash
    gitleaksArchiveSha256 = $archiveHash
    gitleaksBinarySha256 = $gitleaksHash
    npmDatabaseSource = $dbUrl
    npmDatabaseSha256 = $dbHash
    npmDatabaseDownloadedAt = (Get-Item -LiteralPath $dbPath).LastWriteTimeUtc.ToString('o')
    npmDatabaseEntries = $dbEntries
    databaseIntegrityNote = 'HTTPS official OSV bulk archive; SHA256 recorded locally, not a separately authenticated upstream checksum. Cache is not refreshed automatically; review/refresh it before later releases.'
}
$stage = 'prepare-manifest'
Write-AuditText -Path (Join-Path $ToolsRoot 'tools-manifest.json') -Root $ToolsRoot -Text ($manifest | ConvertTo-Json -Depth 6)
$manifest | ConvertTo-Json -Depth 6
exit 0
} catch {
    if (Get-Command Write-AuditFailure -ErrorAction SilentlyContinue) { Write-AuditFailure -Stage $stage -ToolsRoot $ToolsRoot -ErrorType $_.Exception.GetType().Name }
    else { [Console]::Error.WriteLine('{"status":"scanner_error","stage":"initialization"}') }
    exit 2
}
