# QA environment for the v4 QA session. Throwaway data only. Never the live site, never data/app.db.
#   qa-env.ps1 -Setup                 one time: QA clone C:\Users\Public\lt-v4\qa + deps + opencode config + folders
#   qa-env.ps1 -Up [-Sha <sha>]       build that commit (default origin/main) and start 3 production servers on fresh DBs:
#                                       4401 new seed (2 users) · 4402 v3.1.2 data x200, upgraded · 4403 empty (first-run setup)
#   qa-env.ps1 -Reset                 same commit, fresh DBs (use before every reproduction)
#   qa-env.ps1 -Status | -Down
#   qa-env.ps1 -Emulator              debug APK pointed at http://localhost:4401 (adb reverse), installed on the EMULATOR only.
#                                     Refuses if the live address is anywhere in the sources it builds or in the APK.
# Logins + URLs: C:\Users\Public\lt-v4\qa-runs\env\ENV.md
param([switch]$Setup, [switch]$Up, [switch]$Reset, [switch]$Status, [switch]$Down, [switch]$Emulator, [string]$Sha = '')
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Public\lt-v4'
$qa = Join-Path $root 'qa'; $bin = Join-Path $root 'bin'; $v312 = Join-Path $root 'v312'
$runs = Join-Path $root 'qa-runs'; $envDir = Join-Path $runs 'env'; $pidFile = Join-Path $envDir 'pids.json'
$live = 'planner.jeremyjosh.org'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$servers = @(
	@{ name = 'new'; port = 4401; note = 'new seed: user "phone" + a second user you create for sharing/authz tests' },
	@{ name = 'upgraded'; port = 4402; note = 'v3.1.2 seed scaled x200, upgraded by this build (big data, upgrade bugs)' },
	@{ name = 'empty'; port = 4403; note = 'empty DB: first-run /setup flow (setup token in ENV.md)' }
)
New-Item -ItemType Directory -Force $runs, $envDir | Out-Null
function Say([string]$m) { Write-Host "== $m" }
function Get-Pids { if (Test-Path $pidFile) { @(Get-Content $pidFile -Raw | ConvertFrom-Json) } else { @() } }

function Stop-Servers {
	foreach ($p in Get-Pids) { if ($p.pid -and (Get-Process -Id $p.pid -ErrorAction SilentlyContinue)) { & taskkill /PID $p.pid /T /F 2>&1 | Out-Null } }
	Remove-Item $pidFile -ErrorAction SilentlyContinue
}
function Show-Status {
	foreach ($s in $servers) {
		try { $h = Invoke-RestMethod "http://127.0.0.1:$($s.port)/healthz" -TimeoutSec 5; "  $($s.port) $($s.name): UP $($h | ConvertTo-Json -Compress)" }
		catch { "  $($s.port) $($s.name): DOWN" }
	}
	if (Test-Path (Join-Path $envDir 'ENV.md')) { "  logins: $envDir\ENV.md" }
}
function Install-Deps([string]$dir) {
	$lock = Join-Path $dir 'package-lock.json'; if (-not (Test-Path $lock)) { return }
	$stamp = Join-Path $dir 'node_modules\.lt-lock-hash'; $h = (Get-FileHash $lock -Algorithm SHA256).Hash
	if ((Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $h)) { return }
	Push-Location $dir; & npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 1; $ok = ($LASTEXITCODE -eq 0); Pop-Location
	if ($ok) { Set-Content $stamp $h -Encoding ascii } else { throw "npm ci failed in $dir" }
}

if ($Setup) {
	Say 'QA clone'
	if (-not (Test-Path (Join-Path $qa '.git'))) { git clone -q https://github.com/chicenwangs/lifetracker.git $qa }
	git -C $qa fetch -q --tags origin
	foreach ($d in @("$qa\app", "$qa\mobile")) { Install-Deps $d }
	Say 'opencode config + agents -> qa\.opencode'
	$src = Join-Path $qa 'sprint\v4\qa\opencode'
	if (-not (Test-Path $src)) { git -C $qa checkout -q -f --detach origin/main }
	New-Item -ItemType Directory -Force "$qa\.opencode\agents" | Out-Null
	Copy-Item "$src\opencode.json" "$qa\.opencode\opencode.json" -Force
	Copy-Item "$src\agents\*.md" "$qa\.opencode\agents" -Force
	Say 'folders + QA progress'
	New-Item -ItemType Directory -Force (Join-Path $root 'qa-private') | Out-Null
	$prog = Join-Path $root 'state\QA-PROGRESS.md'
	if (-not (Test-Path $prog)) { Set-Content $prog "NOW: round=0 lens=- step=- next=round 1: qa-env.ps1 -Up, then lens 1 (functional)`n`n# v4 QA progress (QA session writes, newest first)`n" -Encoding utf8 }
	Copy-Item (Join-Path $qa 'sprint\v4\scripts\qa-env.ps1') (Join-Path $bin 'qa-env.ps1') -Force
	Say "done. Start opencode in $qa (sprint\v4\qa\PROMPT.md)."
	exit 0
}
if ($Status) { Show-Status; exit 0 }
if ($Down) { Stop-Servers; if (Test-Path $adb) { & $adb reverse --remove-all 2>&1 | Out-Null }; 'servers stopped'; exit 0 }

if ($Up -or $Reset) {
	Stop-Servers
	$app = Join-Path $qa 'app'
	if ($Up) {
		Say 'checkout'
		git -C $qa fetch -q origin
		$ref = if ($Sha) { $Sha } else { 'origin/main' }
		git -C $qa checkout -q -f --detach $ref 2>&1 | Out-Null
		if ($LASTEXITCODE -ne 0) { "cannot check out $ref"; exit 1 }
		Install-Deps $app; Install-Deps (Join-Path $qa 'mobile')
		Say 'production build'
		Push-Location $app; & npm run build 2>&1 | Select-Object -Last 2; $b = $LASTEXITCODE; Pop-Location
		if ($b -ne 0) { 'BUILD FAILED: that is an S1 for the build session (file it)'; exit 1 }
		# servers run from a copy, so test suites may rebuild app\build while the servers keep running
		Remove-Item "$app\build-serve" -Recurse -Force -ErrorAction SilentlyContinue
		Copy-Item "$app\build" "$app\build-serve" -Recurse
	}
	if (-not (Test-Path "$app\build-serve\index.js")) { 'no build yet: run -Up first'; exit 1 }
	$sha = (git -C $qa rev-parse HEAD).Trim()
	Say "fresh databases for $($sha.Substring(0, 7))"
	$db = Join-Path $envDir 'db'
	& node "$bin\migration-check.mjs" --app $app --old "$v312\app" --out $db --sha $sha 2>&1 | Select-Object -Last 1
	$sv = Join-Path $envDir 'servers'; Remove-Item $sv -Recurse -Force -ErrorAction SilentlyContinue
	$copy = @{ new = "$db\new"; upgraded = "$db\upgrade"; empty = '' }
	$pids = @(); $setupToken = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
	$lines = @("# QA environment at $sha ($(Get-Date -Format s))", '', 'Throwaway data. Never use these logins anywhere else.', '')
	foreach ($s in $servers) {
		$dir = Join-Path $sv $s.name; New-Item -ItemType Directory -Force $dir | Out-Null
		if ($copy[$s.name]) { Copy-Item "$($copy[$s.name])\*" $dir -Exclude '*.bak' -Force }
		$dbFile = if ($s.name -eq 'new') { "$dir\new.db" } elseif ($s.name -eq 'upgraded') { "$dir\upgrade.db" } else { "$dir\app.db" }
		$env:DATABASE_PATH = $dbFile; $env:PORT = "$($s.port)"; $env:HOST = '127.0.0.1'; $env:ORIGIN = "http://localhost:$($s.port)"
		$env:APP_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'); $env:SETUP_TOKEN = $setupToken
		$env:BODY_SIZE_LIMIT = '26M'; $env:APP_VERSION = "qa-$($sha.Substring(0, 7))"
		$p = Start-Process node -ArgumentList 'build-serve' -WorkingDirectory $app -WindowStyle Hidden -PassThru -RedirectStandardOutput "$dir\server.log" -RedirectStandardError "$dir\server.err"
		$pids += @{ name = $s.name; port = $s.port; pid = $p.Id }
		$login = if (Test-Path "$dir\TEST-LOGIN.txt") { ((Get-Content "$dir\TEST-LOGIN.txt") -match '^(username|password):') -join ' · ' } else { "no users yet: open /setup, token $setupToken" }
		$lines += "- http://localhost:$($s.port) ($($s.name)): $($s.note). Login: $login. Server log: $dir\server.log"
	}
	foreach ($k in 'DATABASE_PATH', 'PORT', 'HOST', 'ORIGIN', 'APP_SECRET', 'SETUP_TOKEN', 'BODY_SIZE_LIMIT', 'APP_VERSION') { Remove-Item "env:$k" -ErrorAction SilentlyContinue }
	($pids | ConvertTo-Json) | Set-Content $pidFile -Encoding utf8
	$lines += '', 'Emulator: qa-env.ps1 -Emulator (app talks to http://localhost:4401 through adb reverse).'
	Set-Content (Join-Path $envDir 'ENV.md') ($lines -join "`n") -Encoding utf8
	Start-Sleep -Seconds 4
	$bad = 0
	foreach ($s in $servers) {
		$ok = $false
		for ($i = 0; $i -lt 30 -and -not $ok; $i++) { try { $null = Invoke-RestMethod "http://127.0.0.1:$($s.port)/healthz" -TimeoutSec 3; $ok = $true } catch { Start-Sleep -Seconds 1 } }
		if (-not $ok) { $bad++ }
	}
	Show-Status
	if ($bad) { "QA ENV FAILED: $bad server(s) down (see server.err files)"; exit 1 }
	"QA ENV UP at $($sha.Substring(0, 7))"
	exit 0
}

if ($Emulator) {
	if (-not (Test-Path $adb)) { "no adb at $adb"; exit 1 }
	try { $null = Invoke-RestMethod 'http://127.0.0.1:4401/healthz' -TimeoutSec 3 } catch { 'QA server 4401 is down: run -Up first'; exit 1 }
	$dev = (& $adb devices) -match '^emulator-\d+\s+device'
	if (-not $dev) {
		Say 'starting emulator lt_pixel7'
		Start-Process "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -ArgumentList '-avd', 'lt_pixel7', '-no-snapshot-save' -WindowStyle Minimized | Out-Null
		& $adb wait-for-device; for ($i = 0; $i -lt 90 -and ((& $adb shell getprop sys.boot_completed 2>$null) -notmatch '1'); $i++) { Start-Sleep -Seconds 2 }
		$dev = (& $adb devices) -match '^emulator-\d+\s+device'
	}
	if (-not $dev) { 'no emulator came up'; exit 1 }
	if (((& $adb devices) -match '\sdevice$' | Where-Object { $_ -notmatch '^emulator-' }).Count -gt 0) { 'a real phone is connected: unplug it (QA installs on the emulator only)'; exit 1 }
	$mob = Join-Path $qa 'mobile'; $cfg = "$mob\capacitor.config.json"; $str = "$mob\android\app\src\main\res\values\strings.xml"
	$apk = "$mob\android\app\build\outputs\apk\debug\app-debug.apk"
	try {
		Say 'pointing the debug app at http://localhost:4401 (capacitor.config.json AND strings.xml)'
		(Get-Content $cfg -Raw) -replace '"url":\s*"[^"]*"', '"url": "http://localhost:4401", "cleartext": true' | Set-Content $cfg -Encoding utf8 -NoNewline
		(Get-Content $str -Raw) -replace '(<string name="server_url"[^>]*>)[^<]*(</string>)', '${1}http://localhost:4401${2}' | Set-Content $str -Encoding utf8 -NoNewline
		Push-Location $mob; & npx cap sync android 2>&1 | Select-Object -Last 1; Pop-Location
		$left = Get-ChildItem "$mob\capacitor.config.json", "$mob\android\app\src" -Recurse -File -ErrorAction SilentlyContinue | Select-String -SimpleMatch $live -List
		if ($left) { "REFUSED: the live address is still in: $(($left.Path | Select-Object -Unique) -join ', ')"; exit 1 }
		Say 'gradle assembleDebug'
		New-Item -ItemType Directory -Force 'C:\Users\Public\jtmp' | Out-Null
		$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'; $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
		$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Users\Public\jtmp'; $env:GRADLE_OPTS = $env:JAVA_TOOL_OPTIONS
		Push-Location "$mob\android"; & "$mob\android\gradlew.bat" --no-daemon -q assembleDebug 2>&1 | Select-Object -Last 3; $g = $LASTEXITCODE; Pop-Location
		if ($g -ne 0 -or -not (Test-Path $apk)) { 'gradle failed'; exit 1 }
		# check the APK itself: no live address anywhere in it (UTF-8 or UTF-16), and the bundled config points at the QA server
		Add-Type -AssemblyName System.IO.Compression.FileSystem
		$zip = [IO.Compression.ZipFile]::OpenRead($apk); $hits = @(); $cfgOk = $false
		foreach ($e in $zip.Entries) {
			if ($e.Length -gt 20MB) { continue }
			$ms = New-Object IO.MemoryStream; $s = $e.Open(); $s.CopyTo($ms); $s.Close(); $bytes = $ms.ToArray()
			$t8 = [Text.Encoding]::UTF8.GetString($bytes); $t16 = [Text.Encoding]::Unicode.GetString($bytes)
			if ($t8.Contains($live) -or $t16.Contains($live)) { $hits += $e.FullName }
			if ($e.FullName -eq 'assets/capacitor.config.json' -and $t8.Contains('http://localhost:4401')) { $cfgOk = $true }
		}
		$zip.Dispose()
		if ($hits.Count -or -not $cfgOk) { "REFUSED: APK not safe (live address in: $($hits -join ', '); QA config found: $cfgOk). Not installed."; exit 1 }
		Say 'install on the emulator'
		& $adb reverse tcp:4401 tcp:4401 | Out-Null
		& $adb uninstall io.github.chicenwangs.lifetracker 2>&1 | Out-Null
		& $adb install -r $apk 2>&1 | Select-Object -Last 1
		& $adb shell monkey -p io.github.chicenwangs.lifetracker -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null
		'EMULATOR READY: QA debug app installed, talking to http://localhost:4401 (adb reverse). WebView debugging is on (CDP, see docs/v3/QA-LOOP.md).'
	} finally {
		git -C $qa checkout -q -- mobile 2>&1 | Out-Null   # never leave the patched config behind
	}
	exit 0
}
'Use -Setup, -Up, -Reset, -Status, -Down or -Emulator.'
