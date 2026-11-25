# Block until there is something for this agent, then print it and exit. Costs no tokens while it waits.
#   wait.ps1 -Agent W2            -> waits up to -Max seconds (default 240), prints new messages/events, or TIMEOUT
#   wait.ps1 -Agent W2 -Replay 20 -> prints the last 20 messages for you again (after a restart), cursor unchanged
# LEAD sees every worker message + all events. A worker sees messages addressed to it or ALL + events for it or ALL.
param(
	[Parameter(Mandatory)][string]$Agent,
	[int]$Max = 240,
	[int]$Replay = 0
)
. "$PSScriptRoot\lib.ps1"
$team = Get-Team
if (-not (Test-Slot $team $Agent)) { throw "Agent must be one of: $((Get-Slots $team) -join ', ')" }
$coord = Join-Path $team.root 'coord'
$cursorPath = Join-Path $coord "cursor\$Agent.json"

function Test-ForMe($line) {
	try { $m = $line | ConvertFrom-Json } catch { return $false }
	if ($m.from -eq $Agent) { return $false }
	if ($m.to -eq 'SUPERVISOR') { return $false }
	if ($Agent -eq 'LEAD') { return $true }
	return ($m.to -eq $Agent -or $m.to -eq 'ALL')
}

function Get-Sources { @(Get-ChildItem $coord -Filter '*.out.jsonl' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }) + @(Join-Path $coord 'events.jsonl') }

Set-Heartbeat $team $Agent

if ($Replay -gt 0) {
	$all = foreach ($f in Get-Sources) { if (Test-Path $f) { Get-Content $f -Encoding UTF8 | Where-Object { $_.Trim() -and (Test-ForMe $_) } } }
	Get-PhaseLine $team
	$all | Sort-Object { ($_ | ConvertFrom-Json).ts } | Select-Object -Last $Replay
	exit 0
}

$cursor = @{}
$saved = Read-JsonFile $cursorPath
if ($saved) { foreach ($p in $saved.PSObject.Properties) { $cursor[$p.Name] = [long]$p.Value } }

$deadline = (Get-Date).AddSeconds($Max)
while ($true) {
	if (Test-Stop $team) { Get-PhaseLine $team; 'STOP file present: finish your current step, release your locks, write your status, then end.'; exit 0 }
	$found = @()
	foreach ($f in Get-Sources) {
		$name = Split-Path $f -Leaf
		$off = 0L
		if ($cursor.ContainsKey($name)) { $off = $cursor[$name] }
		$r = Read-NewLines $f $off
		$cursor[$name] = $r.offset
		foreach ($l in $r.lines) { if (Test-ForMe $l) { $found += $l } }
	}
	if ($found.Count) {
		Write-JsonFile $cursorPath $cursor
		Get-PhaseLine $team
		$found | Sort-Object { ($_ | ConvertFrom-Json).ts }
		exit 0
	}
	if ((Get-Date) -ge $deadline) {
		Write-JsonFile $cursorPath $cursor
		Get-PhaseLine $team
		"TIMEOUT $(Get-NowIso) nothing new for $Agent"
		exit 0
	}
	Start-Sleep -Seconds 5
}
