# Shared filesystem boundary for these local audit scripts. Trust the scripts,
# Docker daemon and host administrator; do not run with concurrent hostile host writes.
function Test-AuditWithin([string]$Path, [string]$Root) {
    return $Path.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -or
        $Path.StartsWith($Root.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Get-AuditSafePath {
    param([Parameter(Mandatory)][string]$Path, [string]$Root, [ValidateSet('Any', 'File', 'Directory')][string]$Kind = 'Any', [switch]$MustExist)
    $fullPath = [IO.Path]::TrimEndingDirectorySeparator([IO.Path]::GetFullPath($Path))
    if ($fullPath.Contains(',')) { throw 'Audit paths cannot contain commas.' }
    if ($Root) {
        $fullRoot = [IO.Path]::TrimEndingDirectorySeparator([IO.Path]::GetFullPath($Root))
        if (!(Test-AuditWithin $fullPath $fullRoot)) { throw 'Audit path is outside its intended root.' }
    }
    # Check from the volume root downward, before looking through any parent.
    $chain = [Collections.Generic.Stack[string]]::new()
    $current = $fullPath
    while ($current) {
        $chain.Push($current)
        $parent = [IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current = $parent
    }
    $leafAttributes = $null
    while ($chain.Count) {
        $candidate = $chain.Pop()
        $attributes = $null
        try {
            # Windows returns the link's own attributes, including dangling links.
            # Avoid the PowerShell provider overhead; still inspect every component.
            $attributes = [IO.File]::GetAttributes($candidate)
        } catch [IO.FileNotFoundException] {
            # Missing output paths are permitted unless MustExist was requested.
        } catch [IO.DirectoryNotFoundException] {
            # A missing parent likewise means the requested output does not exist.
        }
        # Permission, sharing and other I/O errors are deliberately not swallowed.
        if ($null -ne $attributes -and ($attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse points are disallowed in audit paths.' }
        if ($null -ne $attributes -and $candidate -ne $fullPath -and !($attributes -band [IO.FileAttributes]::Directory)) { throw 'An audit path ancestor is not a directory.' }
        if ($candidate -eq $fullPath) { $leafAttributes = $attributes }
    }
    if ($MustExist -and $null -eq $leafAttributes) { throw 'Required audit path is missing.' }
    if ($null -ne $leafAttributes) {
        if ($Kind -eq 'File' -and ($leafAttributes -band [IO.FileAttributes]::Directory)) { throw 'Expected an audit file.' }
        if ($Kind -eq 'Directory' -and !($leafAttributes -band [IO.FileAttributes]::Directory)) { throw 'Expected an audit directory.' }
    }
    return $fullPath
}

function Get-AuditSafeTree([string]$Path, [string]$Root) {
    $directory = Get-AuditSafePath -Path $Path -Root $Root -Kind Directory -MustExist
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($directory)
    while ($pending.Count) {
        $next = Get-AuditSafePath -Path $pending.Pop() -Root $directory -Kind Directory -MustExist
        # Enumerate only one level at a time. Never recurse into an unchecked link.
        foreach ($item in Get-ChildItem -LiteralPath $next -Force) {
            $null = Get-AuditSafePath -Path $item.FullName -Root $directory -MustExist
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
            $item
        }
    }
}

function New-AuditSafeDirectory([string]$Path, [string]$Root) {
    $safePath = Get-AuditSafePath -Path $Path -Root $Root -Kind Directory
    New-Item -ItemType Directory -Path $safePath -Force | Out-Null
    return Get-AuditSafePath -Path $safePath -Root $Root -Kind Directory -MustExist
}

function Write-AuditText([string]$Path, [string]$Root, [AllowEmptyString()][string]$Text) {
    $safePath = Get-AuditSafePath -Path $Path -Root $Root -Kind File
    [IO.File]::WriteAllText($safePath, $Text, [Text.UTF8Encoding]::new($false))
}

function Write-AuditFailure([string]$Stage, [string]$ToolsRoot, [string]$ErrorType) {
    # No raw exception text or source fragments in the error envelope.
    $failure = [ordered]@{ status = 'scanner_error'; stage = $Stage; errorType = $ErrorType; message = 'Audit operation failed. Review trusted local inputs and any existing tool logs.'; recordedAt = (Get-Date).ToUniversalTime().ToString('o') }
    try {
        $safeTools = Get-AuditSafePath -Path $ToolsRoot -Kind Directory -MustExist
        $errorRoot = New-AuditSafeDirectory -Path (Join-Path $safeTools ('reports/error-' + [guid]::NewGuid().ToString('N'))) -Root $safeTools
        Write-AuditText -Path (Join-Path $errorRoot 'error.json') -Root $safeTools -Text ($failure | ConvertTo-Json)
        $failure.reportRoot = $errorRoot
    } catch { }
    [Console]::Error.WriteLine(($failure | ConvertTo-Json -Compress))
}
