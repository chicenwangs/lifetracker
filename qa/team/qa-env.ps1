# QA environment: one production build of a commit, one seeded throwaway DB + server per worker, optional emulator.
#   qa-env.ps1 -Up -Commit <sha> [-Agent SUPERVISOR]   build wt\QA-BUILD at <sha>, start servers W1..W5 on their qaPort
#   qa-env.ps1 -Down                                     stop those servers
#   qa-env.ps1 -Emulator [-Port 4174] [-From <worktree>] -Agent W1   boot lt_pixel7, build + install the debug APK
#                                                        of -From (default wt\QA-BUILD) pointed at http://localhost:<Port>
#   qa-env.ps1 -Serve -Agent W1                          build YOUR worktree, serve it on your port+1 with a fresh seeded DB
#   qa-env.ps1 -Unserve -Agent W1
#   qa-env.ps1 -Status
# Never touches data/app.db: every DB lives under <root>\qa\<slot>\. Logins: <root>\qa\<slot>\TEST-LOGIN.txt
param(
	[switch]$Up, [switch]$Down, [switch]$Emulator, [switch]$Status, [switch]$Serve, [switch]$Unserve,
	[string]$Commit = '', [int]$Port = 4174, [string]$Agent = 'SUPERVISOR', [string]$Avd = 'lt_pixel7', [string]$From = ''
)
. "$PSScriptRoot\lib.ps1"
$ErrorActionPreference = 'Continue'
$team = Get-Team
$root = $team.root
$build = Join-Path $root 'wt\QA-BUILD'
$envFile = Join-Path $root 'state\qa-env.json'
$log = Join-Path $root 'logs\qa-env.log'
function Say($m) { $line = "$(Get-Date -Format 'MM-dd HH:mm:ss') [$Agent] $m"; Add-Content -Path $log -Value $line -Encoding UTF8; $line }
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

function Stop-QaServers {
	$s = Read-JsonFile $envFile
	$ports = @()
	if ($s) { foreach ($x in $s.servers) { $ports += $x.port; Stop-Process -Id $x.pid -Force -ErrorAction SilentlyContinue } }
	foreach ($slot in Get-Slots $team) { if ($team.slots.$slot.qaPort) { $ports += $team.slots.$slot.qaPort } }
	foreach ($p in ($ports | Sort-Object -Unique)) {
		Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
			$proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
			if ($proc -and $proc.ProcessName -eq 'node') { Stop-Process -Id $proc.Id -Force }
		}
	}
}

if ($Status) { $s = Read-JsonFile $envFile; if ($s) { $s | ConvertTo-Json -Depth 5 } else { 'no QA env' }; exit 0 }
if ($Down) { Stop-QaServers; if (Test-Path $envFile) { Remove-Item $envFile -Force }; Say 'servers down'; exit 0 }

if ($Up) {
	if (-not $Commit) { throw '-Commit <sha> required' }
	$got = & "$PSScriptRoot\lock.ps1" -Agent $Agent -Take heavy -WaitMin 120
	if ($got -notmatch 'LOCKED') { Say "could not get heavy lock: $got"; exit 1 }
	try {
		Stop-QaServers
		Say "checkout $Commit"
		git -C $build checkout -f --detach $Commit --quiet
		if ($LASTEXITCODE) { throw "checkout $Commit failed" }
		Push-Location "$build\app"
		Say 'npm run build'
		npm run build *> (Join-Path $root 'logs\qa-build.log')
		if ($LASTEXITCODE) { Pop-Location; throw 'build failed, see logs\qa-build.log' }
		$servers = @()
		$rand = { -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) }
		foreach ($slot in Get-Slots $team) {
			$qp = $team.slots.$slot.qaPort
			if (-not $qp) { continue }
			$dbDir = Join-Path $root "qa\$slot"
			New-Item -ItemType Directory -Force $dbDir | Out-Null
			Remove-Item "$dbDir\app.db*", "$dbDir\TEST-LOGIN.txt" -Force -ErrorAction SilentlyContinue
			$env:DATABASE_PATH = "$dbDir\app.db"; $env:APP_SECRET = & $rand; $env:SETUP_TOKEN = & $rand
			$env:ORIGIN = "http://localhost:$qp"; $env:PORT = "$qp"; $env:HOST = '127.0.0.1'
			$env:APP_VERSION = "qa-$($Commit.Substring(0, 7))"
			Say "seed $slot"
			npm run db:seed -- --phone --db "$dbDir\app.db" *>> (Join-Path $root 'logs\qa-build.log')
			if ($LASTEXITCODE) { Pop-Location; throw "seed for $slot failed" }
			$p = Start-Process node -ArgumentList 'build' -WorkingDirectory "$build\app" -PassThru -WindowStyle Hidden `
				-RedirectStandardOutput "$dbDir\server.log" -RedirectStandardError "$dbDir\server.err"
			$servers += [ordered]@{ slot = $slot; port = $qp; pid = $p.Id; db = "$dbDir\app.db"; login = "$dbDir\TEST-LOGIN.txt"; url = "http://localhost:$qp" }
		}
		Pop-Location
		foreach ($v in 'DATABASE_PATH', 'APP_SECRET', 'SETUP_TOKEN', 'ORIGIN', 'PORT', 'HOST', 'APP_VERSION') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
		foreach ($s in $servers) {
			$ok = $false
			for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
				try { $ok = ((Invoke-RestMethod "$($s.url)/healthz" -TimeoutSec 3).ok -eq $true) } catch { Start-Sleep 2 }
			}
			if (-not $ok) { throw "server $($s.slot) on $($s.port) did not become healthy, see $(Split-Path $s.db)\server.err" }
		}
		Write-JsonFile $envFile ([ordered]@{ commit = $Commit; at = (Get-NowIso); servers = $servers })
		Say "QA env up at $Commit"
	} finally { & "$PSScriptRoot\lock.ps1" -Agent $Agent -Release heavy | Out-Null }
	exit 0
}

if ($Emulator) {
	if ($From) { $build = $From }
	$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
	$lp = Join-Path $build 'mobile\android\local.properties'
	if (Test-Path $lp) { $m = Select-String -Path $lp -Pattern '^sdk.dir=(.+)$'; if ($m) { $sdk = $m.Matches[0].Groups[1].Value -replace '\\\\', '\' -replace '\\:', ':' } }
	$adb = "$sdk\platform-tools\adb.exe"; $emu = "$sdk\emulator\emulator.exe"
	$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
	New-Item -ItemType Directory -Force 'C:\Users\Public\jtmp' | Out-Null
	$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Users\Public\jtmp'; $env:GRADLE_OPTS = $env:JAVA_TOOL_OPTIONS
	$booted = (& $adb shell getprop sys.boot_completed 2>$null) -match '1'
	if (-not $booted) {
		Say "boot $Avd"
		Start-Process $emu -ArgumentList "-avd $Avd -no-snapshot-save -no-boot-anim" -WindowStyle Hidden | Out-Null
		& $adb wait-for-device
		$t = 0
		while ((& $adb shell getprop sys.boot_completed 2>$null) -notmatch '1') { Start-Sleep 5; $t += 5; if ($t -gt 300) { Say 'emulator did not boot in 5 min'; exit 1 } }
	}
	& $adb reverse "tcp:$Port" "tcp:$Port" | Out-Null
	$got = & "$PSScriptRoot\lock.ps1" -Agent $Agent -Take heavy -WaitMin 120
	if ($got -notmatch 'LOCKED') { Say "could not get heavy lock: $got"; exit 1 }
	try {
		$cfg = Join-Path $build 'mobile\capacitor.config.json'
		$orig = [IO.File]::ReadAllText($cfg)
		[IO.File]::WriteAllText($cfg, ($orig -replace '"url":\s*"[^"]*"', "`"url`": `"http://localhost:$Port`", `"cleartext`": true"), $script:Utf8)
		Push-Location "$build\mobile"; npx cap sync android *> (Join-Path $root 'logs\apk.log'); Pop-Location
		Push-Location "$build\mobile\android"; .\gradlew.bat assembleDebug -q *>> (Join-Path $root 'logs\apk.log'); $g = $LASTEXITCODE; Pop-Location
		git -C $build checkout -- mobile/capacitor.config.json
		if ($g) { Say 'gradle assembleDebug failed, see logs\apk.log'; exit 1 }
	} finally { & "$PSScriptRoot\lock.ps1" -Agent $Agent -Release heavy | Out-Null }
	& $adb install -r "$build\mobile\android\app\build\outputs\apk\debug\app-debug.apk" *>> (Join-Path $root 'logs\apk.log')
	if ($LASTEXITCODE) { Say 'adb install failed, see logs\apk.log'; exit 1 }
	Say "debug APK installed, pointed at http://localhost:$Port"
	exit 0
}
if ($Serve) {
	# Build YOUR worktree as it is now and serve it on your port + 1 with a fresh seeded DB (TESTER / REVIEWER / SKEPTIC checks).
	if (-not (Test-Slot $team $Agent)) { throw '-Serve needs -Agent <slot>' }
	$wt = Join-Path $root "wt\$Agent"; $sp = $team.slots.$Agent.port + 1
	$dbDir = Join-Path $root "qa\serve-$Agent"; New-Item -ItemType Directory -Force $dbDir | Out-Null
	$old = Read-JsonFile (Join-Path $dbDir 'serve.json'); if ($old) { Stop-Process -Id $old.pid -Force -ErrorAction SilentlyContinue }
	$got = & "$PSScriptRoot\lock.ps1" -Agent $Agent -Take heavy -WaitMin 120
	if ($got -notmatch 'LOCKED') { Say "could not get heavy lock: $got"; exit 1 }
	try {
		Push-Location "$wt\app"
		npm run build *> "$dbDir\build.log"
		if ($LASTEXITCODE) { Pop-Location; Say "build failed, see $dbDir\build.log"; exit 1 }
		Remove-Item "$dbDir\app.db*", "$dbDir\TEST-LOGIN.txt" -Force -ErrorAction SilentlyContinue
		$env:DATABASE_PATH = "$dbDir\app.db"; $env:APP_SECRET = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }); $env:SETUP_TOKEN = $env:APP_SECRET.Substring(0, 32)
		$env:ORIGIN = "http://localhost:$sp"; $env:PORT = "$sp"; $env:HOST = '127.0.0.1'; $env:APP_VERSION = "serve-$Agent"
		npm run db:seed -- --phone --db "$dbDir\app.db" *>> "$dbDir\build.log"
		$p = Start-Process node -ArgumentList 'build' -WorkingDirectory "$wt\app" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$dbDir\server.log" -RedirectStandardError "$dbDir\server.err"
		foreach ($v in 'DATABASE_PATH', 'APP_SECRET', 'SETUP_TOKEN', 'ORIGIN', 'PORT', 'HOST', 'APP_VERSION') { Remove-Item "env:$v" -ErrorAction SilentlyContinue }
		Pop-Location
	} finally { & "$PSScriptRoot\lock.ps1" -Agent $Agent -Release heavy | Out-Null }
	$ok = $false; for ($i = 0; $i -lt 30 -and -not $ok; $i++) { try { $ok = ((Invoke-RestMethod "http://localhost:$sp/healthz" -TimeoutSec 3).ok -eq $true) } catch { Start-Sleep 2 } }
	Write-JsonFile (Join-Path $dbDir 'serve.json') ([ordered]@{ pid = $p.Id; port = $sp; commit = (git -C $wt rev-parse HEAD).Trim() })
	if ($ok) { "SERVING $((git -C $wt rev-parse --short HEAD).Trim()) at http://localhost:$sp  login: $dbDir\TEST-LOGIN.txt  (stop: qa-env.ps1 -Unserve -Agent $Agent)" } else { "server did not start, see $dbDir\server.err"; exit 1 }
	exit 0
}
if ($Unserve) {
	$old = Read-JsonFile (Join-Path $root "qa\serve-$Agent\serve.json"); if ($old) { Stop-Process -Id $old.pid -Force -ErrorAction SilentlyContinue }
	"stopped serve-$Agent"; exit 0
}
'usage: qa-env.ps1 -Up -Commit <sha> | -Down | -Emulator [-Port 4174] [-From <worktree>] -Agent W1 | -Serve -Agent <slot> | -Unserve -Agent <slot> | -Status'
