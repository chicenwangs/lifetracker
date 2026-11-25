# Shared-resource locks (create-exclusive files in coord\locks). Prints LOCKED <name> or TIMEOUT.
#   lock.ps1 -Agent W2 -Take heavy [-WaitMin 90]   heavy = any build / e2e / vite / gradle (1 at a time, RAM+disk guard)
#   lock.ps1 -Agent W2 -Take browser               max 2 Playwright browsers at once
#   lock.ps1 -Agent W1 -Take emulator              the one emulator
#   lock.ps1 -Agent W2 -Renew heavy                push the expiry out again (long jobs)
#   lock.ps1 -Agent W2 -Release heavy
#   lock.ps1 -List
# Locks expire (team.json limits). An expired lock may be taken by anyone. Always release in a finally / right after.
param(
	[string]$Agent = '',
	[string]$Take = '',
	[string]$Release = '',
	[string]$Renew = '',
	[int]$WaitMin = 60,
	[switch]$List
)
. "$PSScriptRoot\lib.ps1"
$team = Get-Team
$dir = Join-Path $team.root 'coord\locks'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
$slots = @{ heavy = 1; browser = 2; emulator = 1; git = 1 }
$minutes = @{ heavy = $team.limits.heavyLockMinutes; browser = $team.limits.browserLockMinutes; emulator = $team.limits.emulatorLockMinutes; git = $team.limits.gitLockMinutes }

function Get-LockFiles([string]$name) { 1..$slots[$name] | ForEach-Object { Join-Path $dir "$name.$_.lock" } }

function Test-Expired([string]$f) {
	$l = Read-JsonFile $f
	if (-not $l) { return $true }
	return (([datetime]$l.expires).ToUniversalTime() -lt (Get-Date).ToUniversalTime())
}

if ($List) {
	Get-ChildItem $dir -Filter '*.lock' -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name): $([IO.File]::ReadAllText($_.FullName))" }
	"free RAM $(Get-FreeRamGB) GB, free C: $(Get-FreeDiskGB) GB"
	exit 0
}
if (-not (Test-Slot $team $Agent) -and $Agent -ne 'SUPERVISOR') { throw "Agent must be a slot name or SUPERVISOR" }
$name = "$Take$Release$Renew"
if (-not $slots.ContainsKey($name)) { throw "lock name must be one of: $($slots.Keys -join ', ')" }

if ($Release) {
	foreach ($f in Get-LockFiles $name) { $l = Read-JsonFile $f; if ($l -and $l.agent -eq $Agent) { Remove-Item $f -Force; "RELEASED $name"; exit 0 } }
	"NOT HELD $name"; exit 0
}
if ($Renew) {
	foreach ($f in Get-LockFiles $name) {
		$l = Read-JsonFile $f
		if ($l -and $l.agent -eq $Agent) { $l.expires = (Get-Date).ToUniversalTime().AddMinutes($minutes[$name]).ToString('o'); Write-JsonFile $f $l; "RENEWED $name until $($l.expires)"; exit 0 }
	}
	"NOT HELD $name"; exit 1
}

# Take
Set-Heartbeat $team $Agent
$deadline = (Get-Date).AddMinutes($WaitMin)
$lastSay = Get-Date '2000-01-01'
while ($true) {
	foreach ($f in Get-LockFiles $name) { $l = Read-JsonFile $f; if ($l -and $l.agent -eq $Agent) { "LOCKED $name (already yours)"; exit 0 } }
	$guardOk = $true
	if ($name -eq 'heavy') {
		$ram = Get-FreeRamGB; $disk = Get-FreeDiskGB
		$guardOk = ($ram -ge $team.limits.minFreeRamGB -and $disk -ge $team.limits.minFreeDiskGB)
		if (-not $guardOk -and ((Get-Date) - $lastSay).TotalMinutes -ge 5) { "waiting: host guard (free RAM $ram GB, disk $disk GB)"; $lastSay = Get-Date }
	}
	if ($guardOk) {
		foreach ($f in Get-LockFiles $name) {
			if ((Test-Path $f) -and (Test-Expired $f)) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
			try {
				$fs = [IO.File]::Open($f, 'CreateNew', 'Write', 'None')
				$body = @{ agent = $Agent; name = $name; at = (Get-NowIso); expires = (Get-Date).ToUniversalTime().AddMinutes($minutes[$name]).ToString('o') } | ConvertTo-Json -Compress
				$bytes = $script:Utf8.GetBytes($body)
				$fs.Write($bytes, 0, $bytes.Length); $fs.Close()
				"LOCKED $name"; exit 0
			} catch [System.IO.IOException] { }
		}
	}
	if ((Get-Date) -ge $deadline) { "TIMEOUT $name after $WaitMin min"; exit 0 }
	Start-Sleep -Seconds 15
}
