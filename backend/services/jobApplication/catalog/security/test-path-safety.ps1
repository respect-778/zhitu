#Requires -Version 7.0
[CmdletBinding()]
param([string]$ToolsRoot = 'D:\knownai\outputs\job-catalog-handoff-2026-11-08\evidence\2026-11-09\security-tools')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'path-safety.ps1')
$ToolsRoot = Get-AuditSafePath -Path $ToolsRoot -Kind Directory -MustExist
$testRoot = New-AuditSafeDirectory -Path (Join-Path $ToolsRoot ('regression-sandboxes/path-metadata-' + [guid]::NewGuid().ToString('N'))) -Root $ToolsRoot
$checks = [Collections.Generic.List[string]]::new()
function Expect-Rejection([string]$Name, [scriptblock]$Action, [string]$ExpectedMessage) {
    $rejected = $false
    try { $null = & $Action } catch {
        if ($_.Exception.Message -notlike "*$ExpectedMessage*") { throw }
        $rejected = $true
    }
    if (!$rejected) { throw "Expected rejection: $Name" }
    $checks.Add($Name)
}
$regularFile = Join-Path $testRoot 'regular.txt'
Write-AuditText -Path $regularFile -Root $testRoot -Text 'ordinary fixture'
if ((Get-AuditSafePath -Path $regularFile -Root $testRoot -Kind File -MustExist) -ne $regularFile) { throw 'Normal file path changed.' }
$checks.Add('ordinary-file')
if ((Get-AuditSafePath -Path $testRoot -Root $ToolsRoot -Kind Directory -MustExist) -ne $testRoot) { throw 'Normal directory path changed.' }
$checks.Add('ordinary-directory')
$missingPath = Join-Path $testRoot 'missing-parent/missing.txt'
if ((Get-AuditSafePath -Path $missingPath -Root $testRoot -Kind File) -ne [IO.Path]::GetFullPath($missingPath)) { throw 'Permitted output path changed.' }
$checks.Add('missing-output-allowed')
Expect-Rejection 'missing-input-rejected' { Get-AuditSafePath -Path $missingPath -Root $testRoot -Kind File -MustExist } 'Required audit path is missing'
Expect-Rejection 'file-as-directory-rejected' { Get-AuditSafePath -Path $regularFile -Root $testRoot -Kind Directory -MustExist } 'Expected an audit directory'
Expect-Rejection 'directory-as-file-rejected' { Get-AuditSafePath -Path $testRoot -Root $ToolsRoot -Kind File -MustExist } 'Expected an audit file'
Expect-Rejection 'file-ancestor-rejected' { Get-AuditSafePath -Path (Join-Path $regularFile 'child') -Root $testRoot } 'ancestor is not a directory'
$linkTarget = New-AuditSafeDirectory -Path (Join-Path $testRoot 'empty-link-target') -Root $testRoot
$linkPath = Get-AuditSafePath -Path (Join-Path $testRoot 'dangling-junction') -Root $testRoot
New-Item -ItemType Junction -Path $linkPath -Target $linkTarget | Out-Null
try {
    # Only remove this checked, empty synthetic target; leave the junction dangling.
    $null = Get-AuditSafePath -Path $linkTarget -Root $testRoot -Kind Directory -MustExist
    if (@(Get-ChildItem -LiteralPath $linkTarget -Force).Count) { throw 'Synthetic link target is not empty.' }
    Remove-Item -LiteralPath $linkTarget -Force
    if (!([IO.File]::GetAttributes($linkPath) -band [IO.FileAttributes]::ReparsePoint)) { throw 'Dangling junction metadata not visible.' }
    Expect-Rejection 'dangling-junction-leaf-rejected' { Get-AuditSafePath -Path $linkPath -Root $testRoot } 'Reparse points are disallowed'
    Expect-Rejection 'dangling-junction-ancestor-rejected' { Get-AuditSafePath -Path (Join-Path $linkPath 'child') -Root $testRoot } 'Reparse points are disallowed'
    Expect-Rejection 'dangling-junction-tree-rejected' { Get-AuditSafeTree -Path $testRoot } 'Reparse points are disallowed'
} finally {
    $fullLink = [IO.Path]::GetFullPath($linkPath)
    if (!(Test-AuditWithin $fullLink $testRoot) -or !([IO.File]::GetAttributes($fullLink) -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe test-junction cleanup boundary.' }
    Remove-Item -LiteralPath $fullLink -Force
}
$receipt = [ordered]@{status='passed_path_metadata_regressions';recordedAt=(Get-Date).ToUniversalTime().ToString('o');checks=$checks;testRoot=$testRoot;permissionPolicy='Only FileNotFoundException and DirectoryNotFoundException are caught; permission/sharing/other I/O errors propagate. No ACL was changed by this test.'}
Write-AuditText -Path (Join-Path $testRoot 'receipt.json') -Root $testRoot -Text ($receipt | ConvertTo-Json -Depth 5)
$receipt | ConvertTo-Json -Depth 5
