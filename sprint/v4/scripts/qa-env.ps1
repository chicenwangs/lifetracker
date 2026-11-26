# QA environment for the v4 QA session. Throwaway data only. Never the live site, never data/app.db.
#   qa-env.ps1 -Setup                 one time: QA clone C:\Users\Public\lt-v4\qa + deps + opencode config + folders
#   qa-env.ps1 -Up [-Sha <sha>]       build that commit (default origin/main) and start 3 production servers on fresh DBs:
#                                       4401 new seed - 4402 v3.1.2 data x200, upgraded - 4403 empty (first-run setup)
#   qa-env.ps1 -Reset                 same build, fresh DBs (use before every reproduction)
#   qa-env.ps1 -Status | -Down
#   qa-env.ps1 -Emulator              starts server 4404 (copy of the new seed, ORIGIN http://10.0.2.2:4404) and installs a debug
#                                     APK pointed at it on the EMULATOR only. Refuses if the live address is anywhere in the APK.
# Logins + URLs: C:\Users\Public\lt-v4\qa-runs\env\ENV.md
# Note: -Up checks out a commit with -f in the QA clone. Never keep uncommitted work there.
param([switch]$Setup, [switch]$Up, [switch]$Reset, [switch]$Status, [switch]$Down, [switch]$Emulator, [string]$Sha = '')
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Public\lt-v4'
$qa = Join-Path $root 'qa'; $bin = Join-Path $root 'bin'; $v312 = Join-Path $root 'v312'
$runs = Join-Path $root 'qa-runs'; $envDir = Join-Path $runs 'env'; $pidFile = Join-Path $envDir 'pids.json'
$app = Join-Path $qa 'app'
$live = 'planner.jeremyjosh.org'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$emuUrl = 'http://10.0.2.2:4404'   # 10.0.2.2 = the PC, seen from the emulator
$servers = @(
	@{ name = 'new'; port = 4401; note = 'new seed: user "phone" + a second user you create for sharing/authz tests' },
	@{ name = 'upgraded'; port = 4402; note = 'v3.1.2 seed scaled x200, upgraded by this build (big data, upgrade bugs)' },
	@{ name = 'empty'; port = 4403; note = 'empty DB: first-run /setup flow' }
)
New-Item -ItemType Directory -Force $runs, $envDir | Out-Null
function Say([string]$m) { Write-Host "== $m" }
function Get-Pids { if (Test-Path $pidFile) { @(Get-Content $pidFile -Raw | ConvertFrom-Json) } else { @() } }
function Save-Pids($list) { (ConvertTo-Json -InputObject @($list)) | Set-Content $pidFile -Encoding utf8 }

function Stop-Servers([int[]]$ports = @(4401, 4402, 4403, 4404)) {
	foreach ($p in Get-Pids) { if ($p.pid -and (Get-Process -Id $p.pid -ErrorAction SilentlyContinue)) { & taskkill /PID $p.pid /T /F 2>&1 | Out-Null } }
	# also anything still listening on our ports (a server from an older run): only node processes
	foreach ($port in $ports) {
		foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
			$proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
			if ($proc -and $proc.ProcessName -eq 'node') { & taskkill /PID $proc.Id /T /F 2>&1 | Out-Null }
		}
	}
	Remove-Item $pidFile -ErrorAction SilentlyContinue
}
# up = answers /healthz with exactly this build's version (a stale server from an older build doesn't count)
function Test-Up([int]$port, [string]$version, [int]$tries = 30) {
	for ($i = 0; $i -lt $tries; $i++) {
		try { $h = Invoke-RestMethod "http://127.0.0.1:$port/healthz" -TimeoutSec 3; if ($h.version -eq $version) { return $true } } catch {}
		Start-Sleep -Seconds 1
	}
	$false
}
function Show-Status {
	foreach ($p in @(4401, 4402, 4403, 4404)) {
		try { $h = Invoke-RestMethod "http://127.0.0.1:$p/healthz" -TimeoutSec 5; "  ${p}: UP $($h | ConvertTo-Json -Compress)" } catch { if ($p -ne 4404) { "  ${p}: DOWN" } }
	}
	if (Test-Path (Join-Path $envDir 'ENV.md')) { "  logins: $envDir\ENV.md" }
}
# A launcher file + plain Start-Process (no redirects) = a detached server that doesn't hold the caller's console open.
function Start-QaServer([string]$name, [int]$port, [string]$origin, [string]$dbFile, [string]$dir, [string]$token, [string]$version) {
	$secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
	$cmd = @('@echo off', "set `"DATABASE_PATH=$dbFile`"", "set `"PORT=$port`"", 'set "HOST=127.0.0.1"', "set `"ORIGIN=$origin`"",
		"set `"APP_SECRET=$secret`"", "set `"SETUP_TOKEN=$token`"", 'set "BODY_SIZE_LIMIT=26M"', "set `"APP_VERSION=$version`"",
		"cd /d `"$app`"", "node build-serve > `"$dir\server.log`" 2> `"$dir\server.err`"") -join "`r`n"
	Set-Content "$dir\run.cmd" $cmd -Encoding ascii
	$p = Start-Process cmd.exe -ArgumentList '/c', "`"$dir\run.cmd`"" -WindowStyle Hidden -PassThru
	@{ name = $name; port = $port; pid = $p.Id }
}
function Get-Login([string]$dir, [string]$token) {
	if (Test-Path "$dir\TEST-LOGIN.txt") { ((Get-Content "$dir\TEST-LOGIN.txt") -match '^(username|password):') -join ' / ' } else { "no users yet: open /setup, setup token $token" }
}
function Install-Deps([string]$dir) {
	$lock = Join-Path $dir 'package-lock.json'; if (-not (Test-Path $lock)) { return }
	$stamp = Join-Path $dir 'node_modules\.lt-lock-hash'; $h = (Get-FileHash $lock -Algorithm SHA256).Hash
	if ((Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $h)) { return }
	Push-Location $dir; cmd /c "npm ci --no-audit --no-fund 2>&1" | Select-Object -Last 1; $ok = ($LASTEXITCODE -eq 0); Pop-Location
	if ($ok) { Set-Content $stamp $h -Encoding ascii } else { throw "npm ci failed in $dir" }
}

# ------------------------------------------------------------------ setup
if ($Setup) {
	Say 'QA clone'
	if (-not (Test-Path (Join-Path $qa '.git'))) { git clone -q https://github.com/chicenwangs/lifetracker.git $qa }
	git -C $qa fetch -q --tags origin
	$src = Join-Path $qa 'sprint\v4\qa\opencode'
	if (-not (Test-Path $src)) { git -C $qa checkout -q -f --detach origin/main }
	foreach ($d in @("$qa\app", "$qa\mobile")) { Install-Deps $d }
	Say 'opencode config + agents -> qa\.opencode'
	New-Item -ItemType Directory -Force "$qa\.opencode\agents" | Out-Null
	Copy-Item "$src\opencode.json" "$qa\.opencode\opencode.json" -Force
	Copy-Item "$src\agents\*.md" "$qa\.opencode\agents" -Force
	Say 'folders + QA progress'
	New-Item -ItemType Directory -Force (Join-Path $root 'qa-private'), (Join-Path $root 'state') | Out-Null
	$prog = Join-Path $root 'state\QA-PROGRESS.md'
	if (-not (Test-Path $prog)) { Set-Content $prog "NOW: round=0 lens=- step=- next=round 1: qa-env.ps1 -Up, then lens 1 (functional)`n`n# v4 QA progress (QA session writes, newest first)`n" -Encoding utf8 }
	Copy-Item (Join-Path $qa 'sprint\v4\scripts\qa-env.ps1') (Join-Path $bin 'qa-env.ps1') -Force
	Say "done. Start opencode in $qa (sprint\v4\qa\PROMPT.md)."
	exit 0
}
if ($Status) { Show-Status; exit 0 }
if ($Down) { Stop-Servers; 'servers stopped'; exit 0 }

# ------------------------------------------------------------------ up / reset
if ($Up -or $Reset) {
	Stop-Servers
	if ($Up) {
		Say 'checkout'
		git -C $qa fetch -q origin
		$ref = if ($Sha) { $Sha } else { 'origin/main' }
		git -C $qa checkout -q -f --detach $ref 2>&1 | Out-Null
		if ($LASTEXITCODE -ne 0) { "cannot check out $ref"; exit 1 }
		Install-Deps $app; Install-Deps (Join-Path $qa 'mobile')
		Say 'production build'
		Push-Location $app; cmd /c "npm run build 2>&1" | Select-Object -Last 2; $b = $LASTEXITCODE; Pop-Location
		if ($b -ne 0) { 'BUILD FAILED: that is an S1 for the build session (file it)'; exit 1 }
		# servers run from a copy, so test suites may rebuild app\build while the servers keep running
		Remove-Item "$app\build-serve" -Recurse -Force -ErrorAction SilentlyContinue
		Copy-Item "$app\build" "$app\build-serve" -Recurse
	}
	if (-not (Test-Path "$app\build-serve\index.js")) { 'no build yet: run -Up first'; exit 1 }
	$sha = (git -C $qa rev-parse HEAD).Trim(); $sha7 = $sha.Substring(0, 7)
	Say "fresh databases for $sha7"
	$db = Join-Path $envDir 'db'
	cmd /c "node $bin\migration-check.mjs --app $app --old $v312\app --out $db --sha $sha 2>&1" | Select-Object -Last 1
	$sv = Join-Path $envDir 'servers'; Remove-Item $sv -Recurse -Force -ErrorAction SilentlyContinue
	$copy = @{ new = "$db\new"; upgraded = "$db\upgrade"; empty = '' }
	$token = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
	$pids = @()
	$lines = @("# QA environment at $sha ($(Get-Date -Format s))", '', 'Throwaway data. Never use these logins anywhere else.', '')
	foreach ($s in $servers) {
		$dir = Join-Path $sv $s.name; New-Item -ItemType Directory -Force $dir | Out-Null
		if ($copy[$s.name]) { Copy-Item "$($copy[$s.name])\*" $dir -Exclude '*.bak' -Force }
		$dbFile = if ($s.name -eq 'new') { "$dir\new.db" } elseif ($s.name -eq 'upgraded') { "$dir\upgrade.db" } else { "$dir\app.db" }
		$pids += Start-QaServer $s.name $s.port "http://localhost:$($s.port)" $dbFile $dir $token "qa-$sha7"
		$lines += "- http://localhost:$($s.port) ($($s.name)): $($s.note). Login: $(Get-Login $dir $token). Server log: $dir\server.log"
	}
	Save-Pids $pids
	$lines += '', "Emulator: qa-env.ps1 -Emulator adds server 4404 (copy of the new seed) and an app pointed at $emuUrl."
	Set-Content (Join-Path $envDir 'ENV.md') ($lines -join "`n") -Encoding utf8
	Start-Sleep -Seconds 3
	$bad = @($servers | Where-Object { -not (Test-Up $_.port "qa-$sha7") }).Count
	Show-Status
	if ($bad) { "QA ENV FAILED: $bad server(s) down (see server.err files)"; exit 1 }
	"QA ENV UP at $sha7"
	exit 0
}

# ------------------------------------------------------------------ emulator
if ($Emulator) {
	if (-not (Test-Path $adb)) { "no adb at $adb"; exit 1 }
	if (-not (Test-Path "$envDir\db\new\new.db")) { 'no QA databases: run -Up first'; exit 1 }
	$sha7 = (git -C $qa rev-parse --short=7 HEAD).Trim()
	Say "server 4404 for the emulator (ORIGIN $emuUrl)"
	$dir = Join-Path $envDir 'servers\emulator'
	$keep = @(Get-Pids | Where-Object { $_.name -ne 'emulator' })
	foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort 4404 -ErrorAction SilentlyContinue)) {
		$proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
		if ($proc -and $proc.ProcessName -eq 'node') { & taskkill /PID $proc.Id /T /F 2>&1 | Out-Null }
	}
	Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force $dir | Out-Null
	Copy-Item "$envDir\db\new\*" $dir -Exclude '*.bak' -Force
	$keep += Start-QaServer 'emulator' 4404 $emuUrl "$dir\new.db" $dir ([guid]::NewGuid().ToString('N')) "qa-$sha7"
	Save-Pids $keep
	if (-not (Test-Up 4404 "qa-$sha7")) { 'server 4404 did not start (see its server.err)'; exit 1 }
	Add-Content (Join-Path $envDir 'ENV.md') "- $emuUrl (emulator only; from the PC: http://127.0.0.1:4404): copy of the new seed. Login: $(Get-Login $dir '')."

	$dev = (& $adb devices) -match '^emulator-\d+\s+device'
	if (-not $dev) {
		Say 'starting emulator lt_pixel7'
		Start-Process "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -ArgumentList '-avd', 'lt_pixel7', '-no-snapshot-save' -WindowStyle Minimized | Out-Null
		# bounded wait (adb wait-for-device hangs forever if the emulator never starts)
		for ($i = 0; $i -lt 90; $i++) {
			$dev = (& $adb devices) -match '^emulator-\d+\s+device'
			if ($dev -and ((& $adb shell getprop sys.boot_completed 2>$null) -match '1')) { break }
			Start-Sleep -Seconds 2
		}
		$dev = (& $adb devices) -match '^emulator-\d+\s+device'
		if ($dev -and ((& $adb shell getprop sys.boot_completed 2>$null) -notmatch '1')) { $dev = $null }
	}
	if (-not $dev) { 'no emulator came up'; exit 1 }
	if (@((& $adb devices) -match '\sdevice$' | Where-Object { $_ -notmatch '^emulator-' }).Count -gt 0) { 'a real phone is connected: unplug it (QA installs on the emulator only)'; exit 1 }

	$mob = Join-Path $qa 'mobile'; $cfg = "$mob\capacitor.config.json"; $str = "$mob\android\app\src\main\res\values\strings.xml"
	$man = "$mob\android\app\src\main\AndroidManifest.xml"; $apk = "$mob\android\app\build\outputs\apk\debug\app-debug.apk"
	try {
		Say "pointing the debug app at $emuUrl (capacitor.config.json, strings.xml, manifest cleartext)"
		(Get-Content $cfg -Raw) -replace '"url":\s*"[^"]*"', "`"url`": `"$emuUrl`", `"cleartext`": true" | Set-Content $cfg -Encoding utf8 -NoNewline
		(Get-Content $str -Raw) -replace '(<string name="server_url"[^>]*>)[^<]*(</string>)', "`${1}$emuUrl`${2}" | Set-Content $str -Encoding utf8 -NoNewline
		# target SDK 36 blocks http:// unless the manifest allows it (Capacitor's "cleartext" alone doesn't)
		$m = Get-Content $man -Raw
		if ($m -notmatch 'usesCleartextTraffic') { $m -replace '<application', '<application android:usesCleartextTraffic="true"' | Set-Content $man -Encoding utf8 -NoNewline }
		Push-Location $mob; cmd /c "npx cap sync android 2>&1" | Select-Object -Last 1; Pop-Location
		$left = Get-ChildItem "$mob\capacitor.config.json", "$mob\android\app\src" -Recurse -File -ErrorAction SilentlyContinue | Select-String -SimpleMatch $live -List
		if ($left) { "REFUSED: the live address is still in: $(($left.Path | Select-Object -Unique) -join ', ')"; exit 1 }
		Say 'gradle assembleDebug'
		New-Item -ItemType Directory -Force 'C:\Users\Public\jtmp' | Out-Null
		$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'; $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
		$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Users\Public\jtmp'; $env:GRADLE_OPTS = $env:JAVA_TOOL_OPTIONS
		Push-Location "$mob\android"; cmd /c "gradlew.bat --no-daemon -q assembleDebug 2>&1" | Select-Object -Last 3; $g = $LASTEXITCODE; Pop-Location
		if ($g -ne 0 -or -not (Test-Path $apk)) { 'gradle failed'; exit 1 }
		# the APK itself: no live address anywhere (UTF-8 or UTF-16), and the bundled config points at the QA server
		Add-Type -AssemblyName System.IO.Compression.FileSystem
		$zip = [IO.Compression.ZipFile]::OpenRead($apk); $hits = @(); $cfgOk = $false
		foreach ($e in $zip.Entries) {
			if ($e.Length -gt 20MB) { continue }
			$ms = New-Object IO.MemoryStream; $st = $e.Open(); $st.CopyTo($ms); $st.Close(); $bytes = $ms.ToArray()
			$t8 = [Text.Encoding]::UTF8.GetString($bytes); $t16 = [Text.Encoding]::Unicode.GetString($bytes)
			if ($t8.Contains($live) -or $t16.Contains($live)) { $hits += $e.FullName }
			if ($e.FullName -eq 'assets/capacitor.config.json' -and $t8.Contains($emuUrl)) { $cfgOk = $true }
		}
		$zip.Dispose()
		if ($hits.Count -or -not $cfgOk) { "REFUSED: APK not safe (live address in: $($hits -join ', '); QA config found: $cfgOk). Not installed."; exit 1 }
		Say 'install on the emulator'
		& $adb uninstall io.github.chicenwangs.lifetracker 2>&1 | Out-Null
		& $adb install -r $apk 2>&1 | Select-Object -Last 1
		& $adb shell monkey -p io.github.chicenwangs.lifetracker -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null
		"EMULATOR READY: QA debug app installed, talking to $emuUrl. WebView debugging is on (CDP, see docs/v3/QA-LOOP.md)."
	} finally {
		git -C $qa checkout -q -- mobile 2>&1 | Out-Null   # never leave the patched files behind
	}
	exit 0
}
'Use -Setup, -Up, -Reset, -Status, -Down or -Emulator.'
