# Shared helpers for the team-loop scripts. Windows PowerShell 5.1. Dot-source: . "$PSScriptRoot\lib.ps1"
$ErrorActionPreference = 'Stop'
$script:Utf8 = New-Object System.Text.UTF8Encoding $false

function Get-Team {
	$t = [IO.File]::ReadAllText("$PSScriptRoot\team.json") | ConvertFrom-Json
	if ($env:LT_TEAM_ROOT) { $t.root = $env:LT_TEAM_ROOT }
	return $t
}

function Get-NowIso { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

function Get-Slots($team) { @($team.slots.PSObject.Properties.Name) }

function Test-Slot($team, [string]$name) { (Get-Slots $team) -contains $name }

# Atomic JSON write: tmp file, then replace. Retries because a reader may hold the file open for a moment.
function Write-JsonFile([string]$path, $obj) {
	$dir = Split-Path $path -Parent
	if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
	$tmp = "$path.$PID.tmp"
	[IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $obj -Depth 12), $script:Utf8) # -InputObject keeps [] and 1-item arrays as arrays
	for ($i = 0; $i -lt 20; $i++) {
		try { Move-Item -LiteralPath $tmp -Destination $path -Force; return } catch { Start-Sleep -Milliseconds 250 }
	}
	throw "could not write $path"
}

function Read-JsonFile([string]$path) {
	if (-not (Test-Path $path)) { return $null }
	for ($i = 0; $i -lt 10; $i++) {
		try { $t = [IO.File]::ReadAllText($path); if (-not $t.Trim()) { return $null }; return ($t | ConvertFrom-Json) } catch { Start-Sleep -Milliseconds 200 }
	}
	throw "could not read $path"
}

# One whole line per call (JSONL). Single writer per file, so no lock needed; retry on a reader's share lock.
function Add-JsonLine([string]$path, $obj) {
	$dir = Split-Path $path -Parent
	if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
	$line = (ConvertTo-Json -InputObject $obj -Depth 8 -Compress) + "`n"
	for ($i = 0; $i -lt 20; $i++) {
		try { [IO.File]::AppendAllText($path, $line, $script:Utf8); return } catch { Start-Sleep -Milliseconds 250 }
	}
	throw "could not append to $path"
}

# New complete lines after byte offset. Returns @{ lines = [string[]]; offset = [long] }. A half-written last line is left for next time.
function Read-NewLines([string]$path, [long]$offset) {
	$res = @{ lines = @(); offset = $offset }
	if (-not (Test-Path $path)) { return $res }
	$fs = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
	try {
		if ($fs.Length -lt $offset) { $offset = 0 } # file was replaced: start over
		if ($fs.Length -eq $offset) { $res.offset = $offset; return $res }
		$fs.Seek($offset, 'Begin') | Out-Null
		$buf = New-Object byte[] ($fs.Length - $offset)
		$n = $fs.Read($buf, 0, $buf.Length)
		$text = $script:Utf8.GetString($buf, 0, $n)
		$last = $text.LastIndexOf("`n")
		if ($last -lt 0) { $res.offset = $offset; return $res }
		$complete = $text.Substring(0, $last + 1)
		$res.offset = $offset + $script:Utf8.GetByteCount($complete)
		$res.lines = @($complete -split "`n" | Where-Object { $_.Trim() })
		return $res
	} finally { $fs.Close() }
}

function Set-Heartbeat($team, [string]$agent) {
	$p = Join-Path $team.root "coord\heartbeat\$agent"
	$dir = Split-Path $p -Parent
	if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
	[IO.File]::WriteAllText($p, (Get-NowIso), $script:Utf8)
}

function Get-Phase($team) { Read-JsonFile (Join-Path $team.root 'state\phase.json') }

function Get-PhaseLine($team) {
	$p = Get-Phase $team
	if (-not $p) { return 'PHASE none (run run.ps1 -Setup)' }
	$def = $team.phases | Where-Object { $_.id -eq $p.id }
	return "PHASE $($p.id) mode=$($p.mode) status=$($p.status) iteration=$($p.iteration) scope: $($def.scope)"
}

function Get-FreeRamGB { [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2) }
function Get-FreeDiskGB { [math]::Round((Get-PSDrive C).Free / 1GB, 1) }

function Test-Stop($team) { Test-Path (Join-Path $team.root 'STOP') }
