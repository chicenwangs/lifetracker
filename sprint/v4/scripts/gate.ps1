# Gate: the ONLY thing that decides "tests pass". Agents never claim a pass; this script does.
# It runs in its own worktree (C:\Users\Public\lt-v4\gate) on an exact commit, in the background, so work can go on.
#   gate.ps1 [-Sha <sha>] [-Mode quick|full|site]   start a gate (default: HEAD of the build clone, mode full)
#   gate.ps1 -Wait [-Max 480]                       block up to Max seconds. exit 0 = PASS, 1 = FAIL, 2 = still running
#   gate.ps1 -Status                                show the current or last gate
# quick = lint + check + unit
# full  = quick + e2e desktop + phone + phone-landscape + migration check (+ Android build when mobile/ changed)
# site  = full + Android build + production smoke on an empty DB, an upgraded v3.1.2 DB and a new seed (working-site proof)
# Results: C:\Users\Public\lt-v4\runs\gate-<sha7>-<mode>.json and one log per step. Last line: GATE PASS or GATE FAIL.
# The judge runs from C:\Users\Public\lt-v4\bin (installed by setup.ps1). Agents never edit bin.
param([string]$Sha = '', [ValidateSet('quick', 'full', 'site')][string]$Mode = 'full', [switch]$Wait, [int]$Max = 480, [switch]$Status, [switch]$Child)
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Public\lt-v4'
$bin = Join-Path $root 'bin'; $build = Join-Path $root 'build'; $gate = Join-Path $root 'gate'; $v312 = Join-Path $root 'v312'; $runs = Join-Path $root 'runs'
$cur = Join-Path $runs 'gate-current.json'
New-Item -ItemType Directory -Force $runs | Out-Null

function Read-Cur { if (Test-Path $cur) { try { Get-Content $cur -Raw | ConvertFrom-Json } catch { $null } } }
function Write-Json($obj, [string]$path) { $tmp = "$path.tmp"; ($obj | ConvertTo-Json -Depth 6) | Set-Content $tmp -Encoding utf8; Move-Item $tmp $path -Force }
function Test-Alive($id) { [bool]($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) }
function Show-Result($g) {
	"GATE $($g.mode) $($g.sha7) ($($g.branch)): $($g.state), started $($g.started)"
	foreach ($s in $g.steps) { '  {0,-16} {1,-7} {2,5}s  {3}' -f $s.name, $s.status, $s.seconds, $s.summary }
	if ($g.state -eq 'done') { "Result file: $($g.file)"; if ($g.ok) { 'GATE PASS' } else { 'GATE FAIL' } }
}

# ---------------------------------------------------------------- status / wait
if ($Status) { $c = Read-Cur; if ($c) { Show-Result $c } else { 'No gate has run yet.' }; exit 0 }
if ($Wait) {
	$t0 = Get-Date
	while ($true) {
		$c = Read-Cur
		if (-not $c) { 'No gate has run yet.'; exit 1 }
		if ($c.state -eq 'done') { Show-Result $c; if ($c.ok) { exit 0 } else { exit 1 } }
		if (-not (Test-Alive $c.pid) -and ((Get-Date) - [datetime]$c.started).TotalSeconds -gt 30) {
			$c.state = 'done'; $c.ok = $false; Write-Json $c $cur; Show-Result $c; 'GATE CRASHED (gate process is gone). Start it again.'; exit 1
		}
		if (((Get-Date) - $t0).TotalSeconds -ge $Max) {
			"GATE RUNNING $($c.sha7) $($c.mode): step '$($c.step)', $([int]((Get-Date) - [datetime]$c.started).TotalMinutes) min so far. Call -Wait again."
			exit 2
		}
		Start-Sleep -Seconds 15
	}
}

# ---------------------------------------------------------------- start (parent)
if (-not $Child) {
	$c = Read-Cur
	if ($c -and $c.state -eq 'running' -and (Test-Alive $c.pid)) { "A gate is already running ($($c.sha7) $($c.mode), step '$($c.step)'). Use -Wait."; exit 3 }
	$ref = if ($Sha) { $Sha } else { 'HEAD' }
	$full = (git -C $build rev-parse --verify --quiet "$ref^{commit}" 2>$null)
	if (-not $full) { "Unknown commit '$ref' in $build."; exit 3 }
	$dirty = @(git -C $build status --porcelain 2>$null).Count -gt 0
	$p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Child', '-Sha', $full, '-Mode', $Mode) -WindowStyle Hidden -PassThru
	Write-Json ([ordered]@{ state = 'running'; ok = $false; sha = $full; sha7 = $full.Substring(0, 7); mode = $Mode; branch = '?'; started = (Get-Date).ToString('s'); pid = $p.Id; step = 'starting'; steps = @(); file = '' }) $cur
	"GATE STARTED $($full.Substring(0, 7)) mode=$Mode. Wait with: powershell -NoProfile -ExecutionPolicy Bypass -File $bin\gate.ps1 -Wait"
	if ($dirty) { 'WARNING: the build clone has uncommitted changes. They are NOT in this gate. Commit first, then start a new gate.' }
	exit 0
}

# ---------------------------------------------------------------- child: the actual gate
$sha7 = $Sha.Substring(0, 7)
$branch = (@(git -C $build branch --contains $Sha --format='%(refname:short)' 2>$null) | Select-Object -First 1)
if (-not $branch) { $branch = 'detached' }
$r = [ordered]@{ state = 'running'; ok = $false; sha = $Sha; sha7 = $sha7; mode = $Mode; branch = $branch; started = (Get-Date).ToString('s'); pid = $PID; step = 'checkout'; steps = @(); file = (Join-Path $runs "gate-$sha7-$Mode.json") }
Write-Json $r $cur

function Add-Step([string]$name, [string]$status, [int]$seconds, [string]$summary, [string]$log) {
	$r.steps = @($r.steps) + , ([ordered]@{ name = $name; status = $status; seconds = $seconds; summary = $summary; log = $log })
	Write-Json $r $cur
}
function Clean([string]$t) { ($t -replace "\x1b\[[0-9;?]*[A-Za-z]", '') }
function Get-Tail([string]$t, [int]$n = 4) { ((Clean $t) -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last $n) -join ' | ' }
function Invoke-Cmd([string]$name, [string]$dir, [string]$cmd, [int]$minutes, [hashtable]$envs = @{}) {
	$r.step = $name; Write-Json $r $cur
	$log = Join-Path $runs "gate-$sha7-$Mode-$name.log"
	foreach ($k in $envs.Keys) { Set-Item "env:$k" $envs[$k] }
	$t0 = Get-Date
	$p = Start-Process cmd.exe -ArgumentList "/d /s /c `"($cmd) > $log 2>&1`"" -WorkingDirectory $dir -WindowStyle Hidden -PassThru
	$null = $p.Handle
	$to = -not $p.WaitForExit($minutes * 60000)
	if ($to) { & taskkill /PID $p.Id /T /F 2>&1 | Out-Null }
	foreach ($k in $envs.Keys) { Remove-Item "env:$k" -ErrorAction SilentlyContinue }
	$text = if (Test-Path $log) { Clean (Get-Content $log -Raw) } else { '' }
	@{ code = $(if ($to) { -1 } else { $p.ExitCode }); timedOut = $to; seconds = [int]((Get-Date) - $t0).TotalSeconds; text = "$text"; log = $log }
}
function Num([string]$t, [string]$pattern) { $m = [regex]::Match($t, $pattern); if ($m.Success) { [int]$m.Groups[1].Value } else { 0 } }
function Finish {
	$r.ok = (@($r.steps).Count -gt 0) -and -not (@($r.steps) | Where-Object { $_.status -notin @('pass', 'flaky') })
	$r.state = 'done'; $r.step = ''; $r.finished = (Get-Date).ToString('s')
	Write-Json $r $cur; Write-Json $r $r.file
	Add-Content (Join-Path $runs 'gate-history.jsonl') (([ordered]@{ at = $r.finished; sha7 = $sha7; mode = $Mode; branch = $branch; ok = $r.ok } | ConvertTo-Json -Compress))
	exit 0
}

$app = Join-Path $gate 'app'
$e2eEnv = @{ E2E_PORT = '4301'; TZ = 'Asia/Kuala_Lumpur' }

# 1. exact commit, clean tree
$t0 = Get-Date
$out = (git -C $gate checkout -q --detach $Sha 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { Add-Step 'checkout' 'fail' 0 (Get-Tail $out) ''; Finish }
git -C $gate clean -fdxq -e node_modules 2>&1 | Out-Null
Add-Step 'checkout' 'pass' ([int]((Get-Date) - $t0).TotalSeconds) "$sha7 in $gate" ''

# 2. dependencies follow the lockfile
foreach ($pkg in @('app', 'mobile')) {
	$lock = Join-Path $gate "$pkg\package-lock.json"; $stamp = Join-Path $gate "$pkg\node_modules\.lt-lock-hash"
	if (-not (Test-Path $lock)) { continue }
	$h = (Get-FileHash $lock -Algorithm SHA256).Hash
	if ((Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $h)) { continue }
	$x = Invoke-Cmd "npm-ci-$pkg" (Join-Path $gate $pkg) 'npm ci --no-audit --no-fund' 20
	if ($x.code -eq 0) { Set-Content $stamp $h -Encoding ascii; Add-Step "npm-ci-$pkg" 'pass' $x.seconds 'lockfile changed: reinstalled' $x.log }
	else { Add-Step "npm-ci-$pkg" 'fail' $x.seconds (Get-Tail $x.text) $x.log; Finish }
}

# 3. quick: lint, types, unit (all three run even if one fails, so one fix round sees everything)
$x = Invoke-Cmd 'lint' $app 'npm run lint' 15
Add-Step 'lint' $(if ($x.code -eq 0) { 'pass' } else { 'fail' }) $x.seconds $(if ($x.code -eq 0) { 'clean' } else { Get-Tail $x.text 6 }) $x.log
$x = Invoke-Cmd 'check' $app 'npm run check' 15
$m = [regex]::Match($x.text, 'svelte-check found (\d+) errors? and (\d+) warnings?')
Add-Step 'check' $(if ($x.code -eq 0) { 'pass' } else { 'fail' }) $x.seconds $(if ($m.Success) { $m.Value } else { Get-Tail $x.text }) $x.log
$x = Invoke-Cmd 'unit' $app 'npm run test:unit' 20
$up = Num $x.text 'Tests\s+(?:\d+ failed \| )?(\d+) passed'; $uf = Num $x.text 'Tests\s+(\d+) failed'
$uok = ($x.code -eq 0 -and $up -gt 0 -and $uf -eq 0)
Add-Step 'unit' $(if ($uok) { 'pass' } else { 'fail' }) $x.seconds "$up passed, $uf failed$(if ($up -eq 0) { ' (zero tests = fail)' })" $x.log
if ($Mode -eq 'quick') { Finish }
if (@($r.steps) | Where-Object { $_.status -eq 'fail' }) { Add-Step 'e2e' 'skipped' 0 'quick steps failed: fix them first' ''; Finish }

# 4. e2e, one project at a time. A failure is re-run once (failed tests only): pass on re-run = 'flaky' (reported, not blocking).
foreach ($proj in @('desktop', 'phone', 'phone-landscape')) {
	$name = "e2e-$proj"
	$x = Invoke-Cmd $name $app "npx playwright test --project=$proj" 60 $e2eEnv
	$p1 = Num $x.text '(\d+) passed'; $f1 = Num $x.text '(\d+) failed'; $k1 = Num $x.text '(\d+) flaky'; $s1 = Num $x.text '(\d+) skipped'
	if ($x.code -eq 0 -and $p1 -gt 0) { Add-Step $name 'pass' $x.seconds "$p1 passed, $s1 skipped" $x.log; continue }
	if ($x.timedOut -or $p1 + $f1 -eq 0) { Add-Step $name 'fail' $x.seconds $(if ($x.timedOut) { 'TIMEOUT after 60 min' } else { 'no tests ran: ' + (Get-Tail $x.text) }) $x.log; continue }
	$failed = ([regex]::Matches($x.text, '(?m)^\s+\d+\) \[[^\]]+\] .+$') | ForEach-Object { $_.Value.Trim() } | Select-Object -Unique -First 5) -join ' ; '
	$y = Invoke-Cmd "$name-rerun" $app "npx playwright test --project=$proj --last-failed" 30 $e2eEnv
	if ($y.code -eq 0 -and (Num $y.text '(\d+) passed') -gt 0) { Add-Step $name 'flaky' ($x.seconds + $y.seconds) "$p1 passed, $f1 failed then passed on re-run: $failed" $x.log }
	else { Add-Step $name 'fail' ($x.seconds + $y.seconds) "$p1 passed, $f1 failed (still failing on re-run): $failed" $x.log }
}

# 5. migrations: empty DB, v3.1.2 seed x200 upgraded, new seed
$mig = Join-Path $runs "mig-$sha7"
$x = Invoke-Cmd 'migrations' $gate "node $bin\migration-check.mjs --app $app --old $v312\app --out $mig --sha $Sha" 20
Add-Step 'migrations' $(if ($x.code -eq 0) { 'pass' } else { 'fail' }) $x.seconds $(if ($x.code -eq 0) { 'empty + upgraded v3.1.2 x200 + new seed: clean' } else { ((Clean $x.text) -split "`r?`n" | Where-Object { $_ -match '^FAIL' } | Select-Object -First 3) -join ' | ' }) $x.log

# 6. Android build (never installed anywhere: the debug APK talks to the live server)
$base = (git -C $gate merge-base origin/main $Sha 2>$null)
$mobileChanged = $base -and (@(git -C $gate diff --name-only $base $Sha -- mobile 2>$null).Count -gt 0)
if ($Mode -eq 'site' -or $mobileChanged) {
	New-Item -ItemType Directory -Force 'C:\Users\Public\jtmp' | Out-Null
	$aenv = @{ JAVA_HOME = 'C:\Program Files\Java\jdk-24'; ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"; JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Users\Public\jtmp'; GRADLE_OPTS = '-Djdk.net.unixdomain.tmpdir=C:\Users\Public\jtmp' }
	$x = Invoke-Cmd 'android' (Join-Path $gate 'mobile') 'npx cap sync android && cd android && gradlew.bat --no-daemon assembleDebug testDebugUnitTest' 40 $aenv
	Add-Step 'android' $(if ($x.code -eq 0) { 'pass' } else { 'fail' }) $x.seconds $(if ($x.code -eq 0) { 'assembleDebug + testDebugUnitTest OK (not installed)' } else { Get-Tail $x.text 5 }) $x.log
}
if ($Mode -ne 'site') { Finish }

# 7. working-site proof: production build answers real HTTP on three databases
$x = Invoke-Cmd 'build' $app 'npm run build' 15
Add-Step 'build' $(if ($x.code -eq 0) { 'pass' } else { 'fail' }) $x.seconds $(if ($x.code -eq 0) { 'production build OK' } else { Get-Tail $x.text 5 }) $x.log
if ($x.code -ne 0) { Finish }
$sm = Join-Path $runs "smoke-$sha7"; Remove-Item $sm -Recurse -Force -ErrorAction SilentlyContinue
$cases = @(
	@{ name = 'smoke-empty'; db = "$sm\empty\app.db"; from = ''; port = 4311 },
	@{ name = 'smoke-upgraded'; db = "$sm\upgraded\upgrade.db"; from = "$mig\upgrade"; port = 4312 },
	@{ name = 'smoke-newseed'; db = "$sm\newseed\new.db"; from = "$mig\new"; port = 4313 }
)
foreach ($c in $cases) {
	$dir = Split-Path $c.db; New-Item -ItemType Directory -Force $dir | Out-Null
	$loginArg = ''
	if ($c.from) {
		if (-not (Test-Path (Join-Path $c.from 'TEST-LOGIN.txt'))) { Add-Step $c.name 'fail' 0 "no seeded DB in $($c.from) (migration step failed?)" ''; continue }
		Copy-Item (Join-Path $c.from '*') $dir -Exclude '*.bak' -Force
		$loginArg = "--login $dir\TEST-LOGIN.txt"
	}
	$x = Invoke-Cmd $c.name $gate "node $bin\smoke.mjs --app $app --db $($c.db) --port $($c.port) --label $($c.name) $loginArg" 5
	$fails = ((Clean $x.text) -split "`r?`n" | Where-Object { $_ -match '^FAIL' } | Select-Object -First 3) -join ' | '
	Add-Step $c.name $(if ($x.code -eq 0) { 'pass' } else { 'fail' }) $x.seconds $(if ($x.code -eq 0) { Get-Tail $x.text 1 } else { $fails }) $x.log
}
Finish
