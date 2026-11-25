# Team-loop supervisor. A plain script (no AI): phases, CI watching, QA servers, locks, hard stops, live smoke,
# heartbeat, and the ONLY way to create the release tag. The 6 opencode sessions are started by the owner.
#   run.ps1 -Setup          create C:\Users\Public\lt-team (bin, worktrees, opencode files, state). Safe to re-run.
#   run.ps1                 supervisor loop (Task Scheduler runs this; one instance at a time)
#   run.ps1 -Install        register + start the scheduled task (at logon, restart on failure)   -Uninstall removes it
#   run.ps1 -Status         phase, agents, locks, CI watch, live version
#   run.ps1 -Stop           create the STOP file (everyone finishes the current step and ends)
#   run.ps1 -Resume         delete STOP, restore the phase status (then start the task / sessions again)
#   run.ps1 -Approve 4.0.0  owner only: tag the release candidate, then verify the release
#   run.ps1 -Cleanup        remove worktrees + junctions (after the run, or -Force)
#   run.ps1 -Once           one supervisor tick, then exit (testing). Env LT_TEAM_ROOT = other root, LT_TEAM_TEST=1 = no GitHub writes
param(
	[switch]$Setup, [switch]$Install, [switch]$Uninstall, [switch]$Status, [switch]$Stop, [switch]$Resume,
	[string]$Approve = '', [switch]$Cleanup, [switch]$Force, [switch]$Once
)
. "$PSScriptRoot\lib.ps1"
$ErrorActionPreference = 'Continue'
$team = Get-Team
$root = $team.root
$repo = $team.repo
$taskName = 'LifeTracker team loop'
$slots = Get-Slots $team

function Log($m) {
	$line = "$(Get-Date -Format 'MM-dd HH:mm:ss') $m"
	$f = Join-Path $root 'logs\supervisor.log'
	if (-not (Test-Path (Split-Path $f))) { New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null }
	Add-Content -Path $f -Value $line -Encoding UTF8
	$line
}
function Get-Checkout {
	$s = Read-JsonFile (Join-Path $root 'state\setup.json')
	if ($s -and $s.checkout) { return $s.checkout }
	return (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) # run from <repo>\qa\team
}
function Add-Event($to, $type, $extra = @{}) {
	$e = [ordered]@{ ts = (Get-NowIso); from = 'SUPERVISOR'; to = $to; type = $type }
	foreach ($k in $extra.Keys) { $e[$k] = $extra[$k] }
	Add-JsonLine (Join-Path $root 'coord\events.jsonl') $e
	Log "event $type -> $to $(($extra | ConvertTo-Json -Compress))"
}
function Save-Phase($p) { Write-JsonFile (Join-Path $root 'state\phase.json') $p; Add-JsonLine (Join-Path $root 'state\history.jsonl') $p }
function Get-PhaseDef([string]$id) { $team.phases | Where-Object { $_.id -eq $id } }
function Get-PhaseIndex([string]$id) { for ($i = 0; $i -lt $team.phases.Count; $i++) { if ($team.phases[$i].id -eq $id) { return $i } }; -1 }
function Post-Heartbeat([string]$text) {
	$s = Read-JsonFile (Join-Path $root 'state\setup.json')
	if (-not $s -or -not $s.heartbeatIssue) { Log "heartbeat (no issue): $text"; return }
	if ($env:LT_TEAM_TEST) { Log "heartbeat (test, not posted): $text"; return }
	$body = "$text`n`n_$(Get-Date -Format 'yyyy-MM-dd HH:mm') · $(Get-PhaseLine $team)_"
	gh issue comment $s.heartbeatIssue -R $repo --body $body | Out-Null
	Log "heartbeat: $text"
}
function Hard-Stop([string]$why) {
	[IO.File]::WriteAllText((Join-Path $root 'STOP'), "HARD STOP $(Get-NowIso): $why", $script:Utf8)
	Add-Event 'ALL' 'stop' @{ text = "hard stop: $why" }
	Post-Heartbeat "**Team loop stopped (hard stop):** $why`nFix the cause, then ``run.ps1 -Resume`` and restart the sessions (PROMPTS.md)."
}
function Get-OriginMain { (git -C (Join-Path $root 'wt\LEAD') rev-parse origin/main).Trim() }
function Fetch-Origin {
	$got = & "$PSScriptRoot\lock.ps1" -Agent SUPERVISOR -Take git -WaitMin 5
	if ($got -notmatch 'LOCKED') { return }
	try { git -C (Join-Path $root 'wt\LEAD') fetch origin --prune --quiet } finally { & "$PSScriptRoot\lock.ps1" -Agent SUPERVISOR -Release git | Out-Null }
}

# ------------------------------------------------------------------ setup
function Invoke-Setup {
	$checkout = Get-Checkout
	if (-not (Test-Path "$checkout\.git")) { throw "repo checkout not found at $checkout (run -Setup from <repo>\qa\team\run.ps1)" }
	foreach ($d in 'bin', 'coord\locks', 'coord\cursor', 'coord\heartbeat', 'state', 'wt', 'logs', 'runs', 'qa') { New-Item -ItemType Directory -Force (Join-Path $root $d) | Out-Null }
	$src = Join-Path $checkout 'qa\team'
	if ((Resolve-Path $src).Path -ne (Resolve-Path (Join-Path $root 'bin')).Path) {
		Copy-Item "$src\*" (Join-Path $root 'bin') -Recurse -Force
		Copy-Item (Join-Path $checkout 'qa\TEAM-LOOP.md') (Join-Path $root 'bin\TEAM-LOOP.md') -Force
	}
	$setup = Read-JsonFile (Join-Path $root 'state\setup.json')
	if (-not $setup) { $setup = [pscustomobject]@{ checkout = $checkout; at = (Get-NowIso); heartbeatIssue = 0 } }
	$setup.checkout = $checkout

	git -C $checkout fetch origin --prune --tags --quiet
	$existing = (git -C $checkout worktree list --porcelain) -join "`n"
	$want = @($slots) + @('QA-BUILD', 'V312')
	foreach ($w in $want) {
		$path = Join-Path $root "wt\$w"
		if ($existing -match [regex]::Escape(($path -replace '\\', '/')) -or (Test-Path "$path\.git")) { Log "worktree $w exists"; continue }
		$ref = if ($w -eq 'V312') { $team.baseTag } else { 'origin/main' }
		git -C $checkout worktree add --detach $path $ref --quiet
		if ($LASTEXITCODE) { throw "worktree add $w failed" }
		Log "worktree $w at $ref"
	}
	foreach ($w in $want) {
		$path = Join-Path $root "wt\$w"
		foreach ($nm in 'app\node_modules', 'mobile\node_modules') {
			$target = Join-Path $checkout $nm; $link = Join-Path $path $nm
			if ((Test-Path $target) -and -not (Test-Path $link)) { New-Item -ItemType Junction -Path $link -Target $target | Out-Null }
		}
		$lp = Join-Path $checkout 'mobile\android\local.properties'
		if (Test-Path $lp) { Copy-Item $lp (Join-Path $path 'mobile\android\local.properties') -Force }
		if ($slots -contains $w) {
			New-Item -ItemType Directory -Force "$path\.opencode\agents" | Out-Null
			$cfg = if ($w -eq 'LEAD') { 'opencode.lead.json' } elseif ($w -eq 'W1') { 'opencode.w1.json' } else { 'opencode.worker.json' }
			Copy-Item (Join-Path $root "bin\$cfg") "$path\.opencode\opencode.json" -Force
			Copy-Item (Join-Path $root 'bin\agents\*.md') "$path\.opencode\agents\" -Force
		}
	}
	$gitDir = (git -C $checkout rev-parse --git-common-dir).Trim()
	if (-not [IO.Path]::IsPathRooted($gitDir)) { $gitDir = Join-Path $checkout $gitDir }
	$ex = Join-Path $gitDir 'info\exclude'
	if (-not (Select-String -Path $ex -Pattern '^\.opencode/$' -Quiet)) { Add-Content $ex '.opencode/' }

	if (-not (Test-Path (Join-Path $root 'coord\events.jsonl'))) { New-Item -ItemType File (Join-Path $root 'coord\events.jsonl') | Out-Null }
	if (-not (Get-Phase $team)) {
		$p0 = $team.phases[0]
		Save-Phase ([ordered]@{ index = 0; id = $p0.id; mode = $p0.mode; status = 'running'; iteration = 1; started = (Get-NowIso); rcAttempts = 0; rcSha = '' })
		Add-Event 'ALL' 'phase_start' @{ phase = $p0.id; mode = $p0.mode; text = $p0.scope }
	}
	if (-not $setup.heartbeatIssue -and -not $env:LT_TEAM_TEST) {
		gh label create team-loop -R $repo --color 5319E7 --description 'Autonomous team loop' 2>$null | Out-Null
		$url = gh issue create -R $repo --title 'Team loop heartbeat' --label team-loop --body "Status comments from the team-loop supervisor (qa/TEAM-LOOP.md). One a day, plus phase changes, hard stops and 'waiting for approval'. Comments come from your own account, so GitHub will not push-notify you: open this issue to check."
		if ($url -match '/issues/(\d+)') { $setup.heartbeatIssue = [int]$Matches[1] }
	}
	Write-JsonFile (Join-Path $root 'state\setup.json') $setup
	Log "setup done. heartbeat issue #$($setup.heartbeatIssue)"
	''
	'Open one opencode session per folder (PROMPTS.md has the prompt for each):'
	foreach ($s in $slots) { "  $s  ->  $(Join-Path $root "wt\$s")" }
}

# ------------------------------------------------------------------ status
function Show-Status {
	Get-PhaseLine $team
	$p = Get-Phase $team
	if ($p.rcSha) { "RC sha: $($p.rcSha)" }
	if (Test-Stop $team) { "STOP: $([IO.File]::ReadAllText((Join-Path $root 'STOP')))" }
	foreach ($s in $slots) {
		$hb = Join-Path $root "coord\heartbeat\$s"
		$age = if (Test-Path $hb) { [int]((Get-Date) - (Get-Item $hb).LastWriteTime).TotalMinutes } else { 'never' }
		"  $s last seen $age min ago"
	}
	& "$PSScriptRoot\lock.ps1" -List
	$w = Read-JsonFile (Join-Path $root 'state\ci-watch.json'); if ($w) { "CI watch: $(@($w) | ForEach-Object { "#$($_.pr)" })" }
	$l = Read-JsonFile (Join-Path $root 'state\live.json'); if ($l) { "live: ok=$($l.ok) version=$($l.version) at $($l.at)" }
	$t = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; if ($t) { "scheduled task: $($t.State)" } else { 'scheduled task: not installed' }
}

# ------------------------------------------------------------------ phase changes
function Start-PhaseAt([int]$i, [int]$iteration) {
	$old = Get-Phase $team
	$def = $team.phases[$i]
	$p = [ordered]@{ index = $i; id = $def.id; mode = $def.mode; status = 'running'; iteration = $iteration; started = (Get-NowIso); rcAttempts = $old.rcAttempts; rcSha = $old.rcSha }
	Save-Phase $p
	Add-Event 'ALL' 'phase_start' @{ phase = $def.id; mode = $def.mode; text = $def.scope }
	Post-Heartbeat "Phase **$($def.id)** started ($($def.mode)): $($def.scope)"
	if (@('qa', 'audit') -contains $def.mode) {
		Fetch-Origin
		$sha = Get-OriginMain
		& "$PSScriptRoot\qa-env.ps1" -Up -Commit $sha -Agent SUPERVISOR | ForEach-Object { Log $_ }
		if ($LASTEXITCODE) { Add-Event 'LEAD' 'qa_env_failed' @{ commit = $sha; text = 'see logs\qa-env.log and logs\qa-build.log' } }
		else { Add-Event 'ALL' 'qa_env_ready' @{ commit = $sha; text = "servers: W1..W5 on their qaPort, logins in $root\qa\<slot>\TEST-LOGIN.txt" } }
	} elseif ((Read-JsonFile (Join-Path $root 'state\qa-env.json'))) {
		& "$PSScriptRoot\qa-env.ps1" -Down -Agent SUPERVISOR | Out-Null
	}
}

function On-PhaseDone($m) {
	$p = Get-Phase $team
	if ($m.phase -ne $p.id) { Log "ignored phase_done for $($m.phase) (current $($p.id))"; return }
	if ($p.status -ne 'running') { Log "ignored phase_done: status $($p.status)"; return }
	if ($p.mode -eq 'rc') {
		if ($m.result -eq 'pass' -and $m.commit) {
			$p.status = 'waiting_approval'; $p.rcSha = $m.commit; Save-Phase $p
			Add-Event 'ALL' 'park' @{ text = 'RC done. Finish your step, release locks, write status, end your session. The owner approves the tag.' }
			Post-Heartbeat "**Release candidate ready: $($team.release) at $($m.commit).** Read ``$root\RC-$($team.release).md``, then run ``run.ps1 -Approve $($team.release)``. All agents are parked."
		} else {
			$p.rcAttempts = [int]$p.rcAttempts + 1
			if ($p.rcAttempts -ge $team.maxRcAttempts) { Save-Phase $p; Hard-Stop "release candidate failed $($p.rcAttempts) times: $($m.text)"; return }
			Save-Phase $p
			Start-PhaseAt (Get-PhaseIndex $team.rcFailGoto) ($p.rcAttempts + 1)
		}
		return
	}
	$next = $p.index + 1
	if ($next -ge $team.phases.Count) {
		$p.status = 'finished'; Save-Phase $p
		Add-Event 'ALL' 'stop' @{ text = 'All phases finished. Write your final status and end your session.' }
		Post-Heartbeat "**Team loop finished.** All phases done. Run ``run.ps1 -Cleanup`` when you have read the reports."
		return
	}
	Start-PhaseAt $next 1
}

# ------------------------------------------------------------------ approve (owner) = the only tag path
function Invoke-Approve([string]$ver) {
	$p = Get-Phase $team
	if ($ver -ne $team.release) { throw "version must be $($team.release)" }
	if ($p.status -ne 'waiting_approval' -or -not $p.rcSha) { throw "not waiting for approval (status $($p.status)). Nothing tagged." }
	$checkout = Get-Checkout
	$tag = "v$ver"
	Log "approve $tag requested for $($p.rcSha)"
	git -C $checkout fetch origin --prune --tags --quiet
	$main = (git -C $checkout rev-parse origin/main).Trim()
	if ($main -ne $p.rcSha) { throw "main moved since the RC (main $main, RC $($p.rcSha)). Not tagged. Resume the team (phase p10-rc runs again)." }
	$runs = gh api "repos/$repo/commits/$($p.rcSha)/check-runs" --jq '.check_runs[] | [.name, .status, .conclusion] | @tsv'
	$bad = @($runs | Where-Object { $_ -notmatch "`tcompleted`t(success|skipped|neutral)$" })
	if (-not @($runs).Count -or $bad.Count) { throw "CI is not green on $($p.rcSha): $($bad -join '; '). Not tagged." }
	$pv = (git -C $checkout show "$($p.rcSha):app/package.json" | Out-String | ConvertFrom-Json).version
	if ($pv -ne $ver) { throw "app/package.json at RC is $pv, not $ver. Not tagged." }
	if (git -C $checkout tag -l $tag) { throw "tag $tag already exists locally. Not tagged." }
	if (git -C $checkout ls-remote --tags origin "refs/tags/$tag") { throw "tag $tag already exists on GitHub. Not tagged." }
	foreach ($f in 'RC-' + $ver + '.md') { if (-not (Test-Path (Join-Path $root $f))) { throw "RC report $root\$f missing. Not tagged." } }

	git -C $checkout tag -a $tag $p.rcSha -m "Life Tracker $ver"
	git -C $checkout push origin "refs/tags/$tag"
	if ($LASTEXITCODE) { throw "push of $tag failed" }
	Log "tag $tag pushed at $($p.rcSha)"
	$p.status = 'tagged'; Save-Phase $p

	# post-tag checks
	$checks = New-Object System.Collections.ArrayList
	function Check($n, [bool]$ok, $d) { [void]$checks.Add([ordered]@{ name = $n; ok = $ok; detail = "$d" }); Log "$(if ($ok) { 'PASS' } else { 'FAIL' }) $n :: $d" }
	$run = $null
	for ($i = 0; $i -lt 120; $i++) {
		$run = gh run list -R $repo --workflow release.yml --limit 10 --json databaseId,headSha,status,conclusion | ConvertFrom-Json | Where-Object { $_.headSha -eq $p.rcSha } | Select-Object -First 1
		if ($run -and $run.status -eq 'completed') { break }
		Start-Sleep 30
	}
	Check 'release workflow' ($run -and $run.conclusion -eq 'success') "run $($run.databaseId): $($run.status) $($run.conclusion)"
	$rel = gh release view $tag -R $repo --json assets,isDraft,body,url | ConvertFrom-Json
	$names = @($rel.assets | ForEach-Object { $_.name })
	Check 'release assets' (($names -contains "life-tracker-$ver.apk") -and ($names -contains "deploy-$tag.tar.gz")) ($names -join ', ')
	Check 'release notes present' ([bool]$rel.body -and $rel.body.Length -gt 200) "$($rel.body.Length) chars, $($rel.url)"
	try {
		$tok = (Invoke-RestMethod "https://ghcr.io/token?scope=repository:$($repo):pull").token
		$r = Invoke-WebRequest "https://ghcr.io/v2/$repo/manifests/$ver" -Method Head -UseBasicParsing -Headers @{ Authorization = "Bearer $tok"; Accept = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' }
		Check 'image on GHCR' ($r.StatusCode -eq 200) "ghcr.io/$($repo):$ver"
	} catch { Check 'image on GHCR' $false $_.Exception.Message }
	$tmp = Join-Path $root "runs\release\apk-$ver"; New-Item -ItemType Directory -Force $tmp | Out-Null
	gh release download $tag -R $repo -p '*.apk' -D "$tmp\new" --clobber 2>$null
	gh release download $team.baseTag -R $repo -p '*.apk' -D "$tmp\old" --clobber 2>$null
	$bt = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Android\Sdk\build-tools') -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
	$signer = if ($bt) { Join-Path $bt.FullName 'apksigner.bat' } else { '' }
	$na = Get-ChildItem "$tmp\new" -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
	$oa = Get-ChildItem "$tmp\old" -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
	if ($signer -and (Test-Path $signer) -and $na -and $oa) {
		$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
		$d1 = (& $signer verify --print-certs $na.FullName | Select-String 'SHA-256 digest').Line
		$d2 = (& $signer verify --print-certs $oa.FullName | Select-String 'SHA-256 digest').Line
		Check 'APK signed with the same key as the base release (phones can update)' ($d1 -and $d1 -eq $d2) "new: $d1 / old: $d2"
	} else { Check 'APK signature compare' $false "not checked: apksigner $signer, new apk $($na.Name), old apk $($oa.Name)" }

	$ok = -not ($checks | Where-Object { -not $_.ok })
	$md = @("# $tag released", '', "Commit $($p.rcSha). Post-tag checks: **$(if ($ok) { 'all passed' } else { 'SOME FAILED' })**", '', '| Check | Result | Detail |', '|---|---|---|')
	foreach ($c in $checks) { $md += "| $($c.name) | $(if ($c.ok) { 'pass' } else { '**FAIL**' }) | $($c.detail -replace '\|', '/') |" }
	$md += '', '## Deploy (owner)', "Follow the upgrade section for $($team.baseTag) -> $tag in docs/SERVICE-HANDOFF.md: backup.sh first, try the new image on a COPY of the real DB, then APP_VERSION=$ver, pull, up.", "When /healthz shows $ver the supervisor notices within the hour; then paste the PROMPTS.md part 3 prompts (docs + final audit)."
	[IO.File]::WriteAllText((Join-Path $root "RELEASE-$ver.md"), ($md -join "`n"), $script:Utf8)
	$i = Get-PhaseIndex 'p12-docs'
	Save-Phase ([ordered]@{ index = $i; id = 'p12-docs'; mode = 'docs'; status = 'waiting_deploy'; iteration = 1; started = (Get-NowIso); rcAttempts = $p.rcAttempts; rcSha = $p.rcSha })
	Post-Heartbeat "**$tag tagged** at $($p.rcSha). Post-tag checks: $(if ($ok) { 'all passed' } else { 'SOME FAILED, see RELEASE-' + $ver + '.md' }). Waiting for you to deploy."
	$md -join "`n"
}

# ------------------------------------------------------------------ supervisor loop
function Invoke-Loop {
	$mutex = New-Object System.Threading.Mutex($false, 'Global\lt-team-supervisor')
	if (-not $mutex.WaitOne(0)) { 'supervisor already running'; return }
	if (-not (Get-Phase $team)) { Invoke-Setup | Out-Null }
	Log "supervisor start (pid $PID)"
	$supCursor = @{}
	$sc = Read-JsonFile (Join-Path $root 'state\sup-cursor.json'); if ($sc) { foreach ($x in $sc.PSObject.Properties) { $supCursor[$x.Name] = [long]$x.Value } }
	$last = @{ fetch = [datetime]0; ci = [datetime]0; main = [datetime]0; live = [datetime]0; day = '' }
	$staleSaid = @{}; $lowRamSince = $null; $mainRedSince = $null; $liveFails = 0
	while ($true) {
		try {
			$now = Get-Date
			if (Test-Stop $team) {
				$p = Get-Phase $team
				if ($p.status -ne 'stopped') { $p | Add-Member -NotePropertyName prevStatus -NotePropertyValue $p.status -Force; $p.status = 'stopped'; Save-Phase $p; Add-Event 'ALL' 'stop' @{ text = [IO.File]::ReadAllText((Join-Path $root 'STOP')) } }
				Log 'STOP present: supervisor exits'; break
			}
			$p = Get-Phase $team
			# 1. messages for the supervisor
			foreach ($f in Get-ChildItem (Join-Path $root 'coord') -Filter '*.out.jsonl') {
				$off = 0L; if ($supCursor.ContainsKey($f.Name)) { $off = $supCursor[$f.Name] }
				$r = Read-NewLines $f.FullName $off; $supCursor[$f.Name] = $r.offset
				foreach ($l in $r.lines) {
					$m = $l | ConvertFrom-Json
					if ($m.type -eq 'phase_done' -and $m.from -eq 'LEAD') { On-PhaseDone $m; continue }
					if ($m.to -ne 'SUPERVISOR') { continue }
					switch ($m.type) {
						'watch_ci' {
							$w = @(Read-JsonFile (Join-Path $root 'state\ci-watch.json') | Where-Object { $_ })
							if (-not ($w | Where-Object { $_.pr -eq $m.pr })) { $w += [pscustomobject]@{ pr = $m.pr; since = (Get-NowIso) } }
							Write-JsonFile (Join-Path $root 'state\ci-watch.json') $w
						}
						'qa_env' {
							$sha = if ($m.commit) { $m.commit } else { Fetch-Origin; Get-OriginMain }
							& "$PSScriptRoot\qa-env.ps1" -Up -Commit $sha -Agent SUPERVISOR | ForEach-Object { Log $_ }
							if ($LASTEXITCODE) { Add-Event 'LEAD' 'qa_env_failed' @{ commit = $sha } } else { Add-Event 'ALL' 'qa_env_ready' @{ commit = $sha } }
						}
						'qa_env_down' { & "$PSScriptRoot\qa-env.ps1" -Down -Agent SUPERVISOR | Out-Null; Add-Event 'LEAD' 'qa_env_down' }
						'heartbeat' { Post-Heartbeat "LEAD: $($m.text)" }
						default { Log "unknown supervisor message $($m.type) from $($m.from)" }
					}
				}
			}
			Write-JsonFile (Join-Path $root 'state\sup-cursor.json') $supCursor
			# 2. fetch every 5 min
			if (($now - $last.fetch).TotalMinutes -ge 5) { Fetch-Origin; $last.fetch = $now }
			# 3. CI watch every 3 min
			if (($now - $last.ci).TotalMinutes -ge 3) {
				$last.ci = $now
				$w = @(Read-JsonFile (Join-Path $root 'state\ci-watch.json') | Where-Object { $_ })
				$keep = @()
				foreach ($x in $w) {
					$v = gh pr view $x.pr -R $repo --json state,statusCheckRollup,headRefOid | ConvertFrom-Json
					if (-not $v) { $keep += $x; continue }
					if ($v.state -ne 'OPEN') { continue }
					$cs = @($v.statusCheckRollup)
					$pending = @($cs | Where-Object { ($_.PSObject.Properties.Name -contains 'status' -and $_.status -ne 'COMPLETED') -or $_.state -eq 'PENDING' })
					if ($cs.Count -eq 0 -or $pending.Count) { $keep += $x; continue }
					$failed = @($cs | Where-Object { ($_.conclusion -and @('SUCCESS', 'SKIPPED', 'NEUTRAL') -notcontains $_.conclusion) -or ($_.state -and $_.state -ne 'SUCCESS') } | ForEach-Object { if ($_.name) { $_.name } else { $_.context } })
					Add-Event 'LEAD' 'ci_done' @{ pr = $x.pr; commit = $v.headRefOid; result = $(if ($failed.Count) { 'fail' } else { 'pass' }); items = $failed }
				}
				Write-JsonFile (Join-Path $root 'state\ci-watch.json') $keep
			}
			# 4. main CI every 15 min (red for too long = hard stop)
			if (($now - $last.main).TotalMinutes -ge 15) {
				$last.main = $now
				$mr = gh run list -R $repo --workflow ci.yml --branch main --limit 1 --json conclusion,status,headSha,databaseId | ConvertFrom-Json | Select-Object -First 1
				if ($mr -and $mr.status -eq 'completed' -and $mr.conclusion -eq 'failure') {
					if (-not $mainRedSince) { $mainRedSince = $now; Add-Event 'LEAD' 'main_red' @{ commit = $mr.headSha; text = "CI run $($mr.databaseId) failed on main. Fixing main comes before any other merge." } }
					elseif (($now - $mainRedSince).TotalHours -ge $team.limits.mainRedHours) { Hard-Stop "main CI red for $($team.limits.mainRedHours) h (run $($mr.databaseId))"; continue }
				} elseif ($mr -and $mr.conclusion -eq 'success') { $mainRedSince = $null }
			}
			# 5. expired locks
			Get-ChildItem (Join-Path $root 'coord\locks') -Filter '*.lock' -ErrorAction SilentlyContinue | ForEach-Object {
				$l = Read-JsonFile $_.FullName
				if ($l -and ([datetime]$l.expires).ToUniversalTime() -lt (Get-Date).ToUniversalTime()) { Remove-Item $_.FullName -Force; Log "expired lock removed: $($_.Name) ($($l.agent))"; Add-Event $(if ($l.agent -ne 'SUPERVISOR') { $l.agent } else { 'LEAD' }) 'lock_expired' @{ text = $_.Name } }
			}
			# 6. stale agents (only while a phase runs)
			if ($p.status -eq 'running') {
				foreach ($s in $slots) {
					$hb = Join-Path $root "coord\heartbeat\$s"
					if (-not (Test-Path $hb)) { continue }
					$age = ($now - (Get-Item $hb).LastWriteTime).TotalMinutes
					if ($age -ge $team.limits.staleAgentMinutes -and (-not $staleSaid[$s] -or ($now - $staleSaid[$s]).TotalHours -ge 3)) {
						$staleSaid[$s] = $now
						Add-Event 'LEAD' 'stale_agent' @{ text = "$s silent for $([int]$age) min" }
						if ($s -eq 'LEAD') { Post-Heartbeat "LEAD has been silent for $([int]$age) min. Its opencode session may have ended: paste the LEAD prompt again (PROMPTS.md)." }
					}
				}
			}
			# 7. host guard
			$ram = Get-FreeRamGB; $disk = Get-FreeDiskGB
			if ($disk -lt $team.limits.hardStopDiskGB) { Hard-Stop "free disk C: $disk GB"; continue }
			if ($ram -lt $team.limits.hardStopRamGB) { if (-not $lowRamSince) { $lowRamSince = $now } elseif (($now - $lowRamSince).TotalMinutes -ge 30) { Hard-Stop "free RAM below $($team.limits.hardStopRamGB) GB for 30 min"; continue } } else { $lowRamSince = $null }
			# 8. live smoke hourly
			if (($now - $last.live).TotalMinutes -ge 60) {
				$last.live = $now
				$lf = Join-Path $root 'state\live.json'
				node "$PSScriptRoot\live-smoke.mjs" --url $team.live --out $lf | Out-Null
				$lv = Read-JsonFile $lf
				if ($lv -and -not $lv.ok) { $liveFails++ } else { $liveFails = 0 }
				if ($liveFails -eq 2 -and -not $env:LT_TEAM_TEST) {
					$open = gh issue list -R $repo --label live --state open --json number | ConvertFrom-Json
					if (-not $open) { gh label create live -R $repo --color B60205 2>$null | Out-Null; gh issue create -R $repo --label live --label bug --title 'Live: smoke check failing on planner.jeremyjosh.org' --body "Two hourly read-only smoke checks in a row failed.`n`n``````json`n$([IO.File]::ReadAllText($lf))`n```````n`nFiled by the team-loop supervisor (no login, GET requests only)." | Out-Null }
					Post-Heartbeat 'Live smoke check failed twice in a row. See the `live` issue.'
				}
				if ($p.status -eq 'waiting_deploy' -and $lv -and $lv.ok -and $lv.version -eq $team.release) {
					$p.status = 'running'; $p.started = (Get-NowIso); Save-Phase $p
					Add-Event 'ALL' 'phase_start' @{ phase = $p.id; mode = $p.mode; text = "$($team.release) is live" }
					Post-Heartbeat "**$($team.release) is live.** Paste the PROMPTS.md part 3 prompts to start the docs update and the full code audit."
				}
			}
			# 9. daily digest at the first tick after 08:00
			$today = $now.ToString('yyyy-MM-dd')
			if ($now.Hour -ge 8 -and $last.day -ne $today) {
				$last.day = $today
				$since = $now.AddDays(-1).ToString('yyyy-MM-dd')
				$merged = @(gh pr list -R $repo --state merged --search "merged:>=$since" --json number | ConvertFrom-Json).Count
				$qaOpen = @(gh issue list -R $repo --label qa-loop --state open --json number --limit 200 | ConvertFrom-Json).Count
				$bl = Join-Path $root 'blockers.md'; $blockers = if (Test-Path $bl) { @(Select-String -Path $bl -Pattern '^## ').Count } else { 0 }
				$ages = ($slots | ForEach-Object { $hb = Join-Path $root "coord\heartbeat\$_"; if (Test-Path $hb) { "$_ $([int]($now - (Get-Item $hb).LastWriteTime).TotalMinutes)m" } else { "$_ never" } }) -join ', '
				Post-Heartbeat "Daily: PRs merged last 24 h: $merged · open qa-loop issues: $qaOpen · blockers: $blockers · agents last seen: $ages · free disk $disk GB, RAM $ram GB · live $(if ($lv) { $lv.version })"
			}
		} catch { Log "tick error: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)" }
		if ($Once) { break }
		Start-Sleep -Seconds 60
	}
	$mutex.ReleaseMutex()
}

# ------------------------------------------------------------------ cleanup
function Invoke-Cleanup {
	$p = Get-Phase $team
	if (-not $Force -and $p -and $p.status -notin @('finished', 'stopped')) { throw "phase status is $($p.status). Use -Force to clean up anyway." }
	& "$PSScriptRoot\qa-env.ps1" -Down -Agent SUPERVISOR | Out-Null
	$checkout = Get-Checkout
	foreach ($w in (@($slots) + @('QA-BUILD', 'V312'))) {
		$path = Join-Path $root "wt\$w"
		if (-not (Test-Path $path)) { continue }
		foreach ($nm in 'app\node_modules', 'mobile\node_modules') { $link = Join-Path $path $nm; if ((Get-Item $link -ErrorAction SilentlyContinue).LinkType -eq 'Junction') { cmd /c rmdir "$link" } }
		git -C $checkout worktree remove --force $path
		Log "worktree $w removed"
	}
	git -C $checkout worktree prune
	'Cleanup done. Your app\node_modules is untouched (junctions removed first). Coord, logs, runs and reports stay in ' + $root
}

# ------------------------------------------------------------------ dispatch
if ($Setup) { Invoke-Setup; exit 0 }
if ($Status) { Show-Status; exit 0 }
if ($Stop) { [IO.File]::WriteAllText((Join-Path $root 'STOP'), "owner stop $(Get-NowIso)", $script:Utf8); 'STOP file created. Agents finish their current step and end; the supervisor exits within a minute.'; exit 0 }
if ($Resume) {
	Remove-Item (Join-Path $root 'STOP') -Force -ErrorAction SilentlyContinue
	$p = Get-Phase $team
	if ($p.status -eq 'stopped') { $p.status = if ($p.prevStatus) { $p.prevStatus } else { 'running' }; Save-Phase $p }
	Add-Event 'ALL' 'resume' @{ text = 'resumed by owner' }
	"Resumed: $(Get-PhaseLine $team). Start the supervisor (Start-ScheduledTask '$taskName') and paste the prompts again."
	exit 0
}
if ($Approve) { try { Invoke-Approve $Approve } catch { "NOT TAGGED: $($_.Exception.Message)"; exit 1 }; exit 0 }
if ($Cleanup) { Invoke-Cleanup; exit 0 }
if ($Install) {
	$bin = Join-Path $root 'bin\run.ps1'
	if (-not (Test-Path $bin)) { throw "run -Setup first ($bin missing)" }
	$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bin`"" -WorkingDirectory $root
	$t = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
	$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Days 30) -MultipleInstances IgnoreNew
	Register-ScheduledTask -TaskName $taskName -Action $a -Trigger $t -Settings $s -Force | Out-Null
	Start-ScheduledTask -TaskName $taskName
	"Scheduled task '$taskName' installed and started. Log: $root\logs\supervisor.log"
	exit 0
}
if ($Uninstall) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false; "stopped and removed '$taskName'"; exit 0 }
Invoke-Loop
