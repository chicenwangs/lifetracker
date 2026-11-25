# Release check on one exact commit, in YOUR worktree. Check 1 = LEAD, check 2 = W1 (TESTER, with -Apk).
#   release-check.ps1 -Agent LEAD -Sha <sha>
#   release-check.ps1 -Agent W1 -Sha <sha> -Apk        (QA env must be up at the same sha: qa-env.ps1 -Status)
# Writes <root>\runs\release\<Agent>-<sha7>\result.json + summary.md. Exit 0 only if every step passed.
param([Parameter(Mandatory)][string]$Agent, [Parameter(Mandatory)][string]$Sha, [switch]$Apk)
. "$PSScriptRoot\lib.ps1"
$ErrorActionPreference = 'Continue'
$team = Get-Team
$root = $team.root
$wt = Join-Path $root "wt\$Agent"
$out = Join-Path $root "runs\release\$Agent-$($Sha.Substring(0,7))"
New-Item -ItemType Directory -Force $out | Out-Null
$steps = New-Object System.Collections.ArrayList
function Step($name, [bool]$ok, $summary) {
	[void]$steps.Add([ordered]@{ name = $name; ok = $ok; summary = "$summary" })
	"$(if ($ok) { 'PASS' } else { 'FAIL' }) $name :: $summary"
	Set-Heartbeat $team $Agent
}
function Tail($file, $n = 4) { (Get-Content $file -Tail $n -ErrorAction SilentlyContinue | Where-Object { $_.Trim() }) -join ' | ' }

# 0. exact commit, clean worktree
$dirty = git -C $wt status --porcelain
if ($dirty) { Step 'worktree clean' $false ($dirty -join '; '); }
else {
	git -C $wt switch --detach $Sha --quiet
	$head = git -C $wt rev-parse HEAD
	Step 'worktree at sha' ($head -eq $Sha) $head
}

# 1. CI green on this exact commit
$runs = gh api "repos/$($team.repo)/commits/$Sha/check-runs" --jq '.check_runs[] | [.name, .status, .conclusion] | @tsv' 2>$null
$bad = @($runs | Where-Object { $_ -notmatch "`tcompleted`t(success|skipped|neutral)$" })
Step 'CI green on sha' ((@($runs).Count -gt 0) -and ($bad.Count -eq 0)) "$(@($runs).Count) check runs; not green: $($bad -join '; ')"

# 2. version
$ver = ([IO.File]::ReadAllText("$wt\app\package.json") | ConvertFrom-Json).version
Step 'package.json version' ($ver -eq $team.release) "app/package.json = $ver, expected $($team.release)"

Push-Location "$wt\app"
# 3. light checks
npm run lint *> "$out\lint.log"; Step 'lint' ($LASTEXITCODE -eq 0) (Tail "$out\lint.log" 2)
npm run check *> "$out\check.log"; Step 'svelte-check' ($LASTEXITCODE -eq 0) (Tail "$out\check.log" 2)
npm run test:unit *> "$out\unit.log"; Step 'unit tests' ($LASTEXITCODE -eq 0) (Tail "$out\unit.log" 4)

# 4. heavy: full e2e (3 projects) + production boot, under heavy.lock
$got = & "$PSScriptRoot\lock.ps1" -Agent $Agent -Take heavy -WaitMin 180
if ($got -notmatch 'LOCKED') { Step 'heavy lock' $false $got }
else {
	try {
		$env:E2E_PORT = "$($team.slots.$Agent.port)"
		foreach ($proj in 'desktop', 'phone', 'phone-landscape') {
			npx playwright test --project=$proj --reporter=line *> "$out\e2e-$proj.log"
			Step "e2e $proj" ($LASTEXITCODE -eq 0) (Tail "$out\e2e-$proj.log" 4)
			& "$PSScriptRoot\lock.ps1" -Agent $Agent -Renew heavy | Out-Null
		}
		Remove-Item env:E2E_PORT
		# production build boots on a fresh DB (migrations run at boot) and reports the version
		npm run build *> "$out\build.log"
		if ($LASTEXITCODE) { Step 'production build' $false (Tail "$out\build.log" 3) }
		else {
			$bp = $team.slots.$Agent.port + 1
			$db = Join-Path $out 'boot\app.db'; New-Item -ItemType Directory -Force (Split-Path $db) | Out-Null
			$env:DATABASE_PATH = $db; $env:PORT = "$bp"; $env:HOST = '127.0.0.1'; $env:ORIGIN = "http://localhost:$bp"
			$env:APP_SECRET = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }); $env:SETUP_TOKEN = $env:APP_SECRET.Substring(0, 32); $env:APP_VERSION = $team.release
			$p = Start-Process node -ArgumentList 'build' -WorkingDirectory "$wt\app" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$out\boot.log" -RedirectStandardError "$out\boot.err"
			foreach ($v in 'DATABASE_PATH', 'PORT', 'HOST', 'ORIGIN', 'APP_SECRET', 'SETUP_TOKEN', 'APP_VERSION') { Remove-Item "env:$v" }
			$h = $null
			for ($i = 0; $i -lt 30 -and -not $h; $i++) { try { $h = Invoke-RestMethod "http://localhost:$bp/healthz" -TimeoutSec 3 } catch { Start-Sleep 2 } }
			$login = $null; try { $login = (Invoke-WebRequest "http://localhost:$bp/login" -UseBasicParsing -TimeoutSec 5).StatusCode } catch { }
			Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
			Step 'production boot' ($h -and $h.ok -and $h.version -eq $team.release -and $login -eq 200) "healthz ok=$($h.ok) version=$($h.version) db=$($h.db); /login $login"
		}
	} finally { & "$PSScriptRoot\lock.ps1" -Agent $Agent -Release heavy | Out-Null }
}

# 5. migrations: empty, old-release upgrade scaled x50, new seed
node "$PSScriptRoot\migration-check.mjs" --app "$wt\app" --old (Join-Path $root 'wt\V312\app') --out "$out\migrations" --root $root *> "$out\migrations.log"
Step 'migration check' ($LASTEXITCODE -eq 0) (Tail "$out\migrations.log" 4)

# 6. dependencies
npm audit --omit=dev --json *> "$out\audit.json"
$crit = 0; $high = 0
try { $a = [IO.File]::ReadAllText("$out\audit.json") | ConvertFrom-Json; $crit = $a.metadata.vulnerabilities.critical; $high = $a.metadata.vulnerabilities.high } catch { }
Step 'npm audit (prod deps)' ($crit -eq 0) "critical $crit, high $high (high = listed in the RC report, not a blocker)"
Pop-Location
$deps = git -C $wt diff "$($team.baseTag)" $Sha -- app/package.json mobile/package.json | Select-String '^[+-]\s+"(@?[a-z0-9/_.-]+)":\s*"' | ForEach-Object { $_.Line.Trim() }
Step 'dependency changes since base tag (info)' $true ($(if ($deps) { $deps -join '; ' } else { 'none' }))

# 7. APK (W1 only): debug build of this sha installs and launches on the emulator
if ($Apk) {
	$qaEnv = Read-JsonFile (Join-Path $root 'state\qa-env.json')
	if (-not $qaEnv -or $qaEnv.commit -ne $Sha) { Step 'APK on emulator' $false "QA env is not at $Sha (qa-env.ps1 -Status)" }
	else {
		$r = & "$PSScriptRoot\qa-env.ps1" -Emulator -Port $team.slots.W1.qaPort -Agent $Agent
		$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
		& $adb shell am start -n io.github.chicenwangs.lifetracker/.MainActivity | Out-Null
		Start-Sleep 8
		$pidOf = & $adb shell pidof io.github.chicenwangs.lifetracker
		Step 'APK on emulator' ([bool]$pidOf) "install: $($r | Select-Object -Last 1); running pid: $pidOf"
	}
}

$ok = -not ($steps | Where-Object { -not $_.ok })
Write-JsonFile "$out\result.json" ([ordered]@{ ok = $ok; sha = $Sha; agent = $Agent; at = (Get-NowIso); steps = $steps })
$md = @("# Release check $($team.release) by $Agent on $Sha", '', "Result: **$(if ($ok) { 'PASS' } else { 'FAIL' })**", '', '| Step | Result | Summary |', '|---|---|---|')
foreach ($s in $steps) { $md += "| $($s.name) | $(if ($s.ok) { 'pass' } else { '**FAIL**' }) | $($s.summary -replace '\|', '/') |" }
[IO.File]::WriteAllText("$out\summary.md", ($md -join "`n"), $script:Utf8)
"RESULT $(if ($ok) { 'PASS' } else { 'FAIL' }) -> $out\summary.md"
exit $(if ($ok) { 0 } else { 1 })
