# Overnight QA loop (docs/v3/QA-LOOP.md): fresh test server + emulator + debug app, then opencode runs passes 1-5.
# Run:      powershell -NoProfile -ExecutionPolicy Bypass -File qa\qa-night.ps1 [-Avd Pixel_7] [-From 1] [-To 5]
# Nightly:  see docs/v3/QA-LOOP.md "Schedule".  Windows PowerShell 5.1.
param([string]$Avd = '', [int]$From = 1, [int]$To = 5)
# Continue, not Stop: in PowerShell 5.1 a native tool writing to stderr (npm warnings) would end the script.
$ErrorActionPreference = 'Continue'
function Must($what) { if ($LASTEXITCODE) { throw "$what failed (exit $LASTEXITCODE), see night.log" } }

$root = Split-Path $PSScriptRoot -Parent
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'C:\Android\Sdk' }
$adb = "$sdk\platform-tools\adb.exe"
$emu = "$sdk\emulator\emulator.exe"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$run = "$root\data\qa\runs\$(Get-Date -Format yyyy-MM-dd)"
New-Item -ItemType Directory -Force "$run\parts", "$run\shots", "$run\ui" | Out-Null
$log = "$run\night.log"
function Say($m) { "$(Get-Date -Format HH:mm:ss) $m" | Tee-Object -FilePath $log -Append }
$noBom = New-Object System.Text.UTF8Encoding $false

# ---- 1. test server on a fresh seeded DB (never your real data) ----
$rand = { [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N') }
$env:DATABASE_PATH = "$root\data\qa\app.db"
$env:ORIGIN = 'http://localhost:4174'
$env:PORT = '4174'
$env:HOST = '127.0.0.1'
$env:APP_SECRET = & $rand
$env:SETUP_TOKEN = & $rand
Remove-Item "$root\data\qa\app.db*", "$root\data\qa\TEST-LOGIN.txt" -Force -ErrorAction SilentlyContinue
Push-Location "$root\app"
Say 'seed + build'
npm run db:seed -- --phone --db $env:DATABASE_PATH *>> $log; Must 'seed'
npm run build *>> $log; Must 'build'
$server = Start-Process node -ArgumentList 'build' -WorkingDirectory "$root\app" -PassThru -WindowStyle Hidden `
	-RedirectStandardOutput "$run\server.log" -RedirectStandardError "$run\server.err"
Pop-Location

$emuProc = $null
try {
	# ---- 2. emulator ----
	if (-not $Avd) { $Avd = (& $emu -list-avds | Select-Object -First 1) }
	if (-not $Avd) { throw 'No emulator device. Create one in Android Studio > Device Manager.' }
	Say "emulator $Avd"
	$emuProc = Start-Process $emu -ArgumentList "-avd $Avd -no-snapshot-save -no-boot-anim" -PassThru -WindowStyle Hidden
	& $adb wait-for-device
	$t = 0
	while ((& $adb shell getprop sys.boot_completed 2>$null) -notmatch '1') {
		Start-Sleep 5; $t += 5
		if ($t -gt 300) { throw 'emulator did not boot in 5 min' }
	}
	& $adb reverse tcp:4174 tcp:4174 | Out-Null

	# ---- 3. debug app pointed at the test server (config restored even on failure) ----
	$cfg = "$root\mobile\capacitor.config.json"
	$orig = [IO.File]::ReadAllText($cfg)
	try {
		$qa = $orig -replace '"url":\s*"[^"]*"', '"url": "http://localhost:4174", "cleartext": true'
		[IO.File]::WriteAllText($cfg, $qa, $noBom)
		Say 'build debug app'
		Push-Location "$root\mobile"; npx cap sync android *>> $log; Pop-Location
		Push-Location "$root\mobile\android"; .\gradlew.bat assembleDebug -q *>> $log; $g = $LASTEXITCODE; Pop-Location
		if ($g) { throw 'gradle assembleDebug failed, see night.log' }
	} finally {
		[IO.File]::WriteAllText($cfg, $orig, $noBom)
		Push-Location "$root\mobile"; npx cap sync android *>> $log; Pop-Location
	}
	& $adb install -r "$root\mobile\android\app\build\outputs\apk\debug\app-debug.apk" *>> $log; Must 'adb install'

	# ---- 4. the passes (one opencode run each; a pass that doesn't finish gets one retry) ----
	foreach ($n in $From..$To) {
		$done = "$run\pass-$n.done"
		foreach ($try in 1, 2) {
			if (Test-Path $done) { break }
			Say "pass $n (try $try)"
			$prompt = "Follow docs/v3/QA-LOOP.md exactly. Run pass $n only. Run folder: $run (ledger findings.json, " +
				"parts\, shots\, ui\). Test login: data\qa\TEST-LOGIN.txt. App server: http://localhost:4174, already in " +
				"the emulator app. Passes 1-3: use the subagents qa-scout / qa-repro / qa-skeptic, one at a time. " +
				"When the pass is complete, write $done with a 3-line summary (counts)."
			opencode run $prompt *>> "$run\pass-$n.log"
		}
		if (-not (Test-Path $done)) { Say "pass $n did not finish; stopping"; break }
	}
	Say 'night done'
} finally {
	& $adb reverse --remove-all 2>$null | Out-Null
	if ($emuProc) { & $adb emu kill 2>$null | Out-Null }
	if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
