# v4 sprint environment. Safe to run again: it only adds what is missing and refreshes the judge scripts.
#   powershell -NoProfile -ExecutionPolicy Bypass -File <clone>\sprint\v4\scripts\setup.ps1 [-Reinstall]
# Creates C:\Users\Public\lt-v4\ { build (clone), gate (worktree), v312 (worktree at v3.1.2), bin, runs, state }.
# Installs the judge (gate.ps1, smoke.mjs, migration-check.mjs) into bin, the opencode config + agents into build\.opencode,
# and the board + progress files into state (only if missing: never overwrites live state).
param([switch]$Reinstall)
$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Public\lt-v4'
$repo = 'https://github.com/chicenwangs/lifetracker.git'
$build = Join-Path $root 'build'; $gate = Join-Path $root 'gate'; $v312 = Join-Path $root 'v312'
$bin = Join-Path $root 'bin'; $runs = Join-Path $root 'runs'; $state = Join-Path $root 'state'
New-Item -ItemType Directory -Force $root, $bin, $runs, $state | Out-Null

function Step([string]$msg) { Write-Host "== $msg" }
function Install-Deps([string]$dir) {
	$lock = Join-Path $dir 'package-lock.json'; if (-not (Test-Path $lock)) { return }
	$stamp = Join-Path $dir 'node_modules\.lt-lock-hash'; $h = (Get-FileHash $lock -Algorithm SHA256).Hash
	if (-not $Reinstall -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $h)) { Write-Host "   $dir deps up to date"; return }
	Push-Location $dir; & npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 2; $ok = ($LASTEXITCODE -eq 0); Pop-Location
	if ($ok) { Set-Content $stamp $h -Encoding ascii } else { throw "npm ci failed in $dir" }
}

Step 'clone + worktrees'
if (-not (Test-Path (Join-Path $build '.git'))) { git clone -q $repo $build }
git -C $build fetch -q --tags origin
if (-not (Test-Path (Join-Path $gate '.git'))) { git -C $build worktree add -q --detach $gate origin/main }
if (-not (Test-Path (Join-Path $v312 '.git'))) { git -C $build worktree add -q --detach $v312 v3.1.2 }
git -C $build config user.name 2>$null | Out-Null

Step 'dependencies (build, gate, v312)'
foreach ($d in @("$build\app", "$build\mobile", "$gate\app", "$gate\mobile", "$v312\app")) { Install-Deps $d }

Step 'judge scripts -> bin'
$src = Join-Path $build 'sprint\v4\scripts'
foreach ($f in @('gate.ps1', 'smoke.mjs', 'migration-check.mjs')) {
	if (-not (Test-Path (Join-Path $src $f))) { throw "missing $src\$f (is the v4 setup PR merged and the clone on main?)" }
	Copy-Item (Join-Path $src $f) (Join-Path $bin $f) -Force
}

Step 'opencode config + agents -> build\.opencode'
$oc = Join-Path $build '.opencode'
New-Item -ItemType Directory -Force (Join-Path $oc 'agents') | Out-Null
Copy-Item (Join-Path $build 'sprint\v4\opencode\opencode.json') (Join-Path $oc 'opencode.json') -Force
Copy-Item (Join-Path $build 'sprint\v4\opencode\agents\*.md') (Join-Path $oc 'agents') -Force

Step 'state (only if missing)'
foreach ($f in @('BOARD.md', 'PROGRESS.md')) {
	$dst = Join-Path $state $f
	if (-not (Test-Path $dst)) { Copy-Item (Join-Path $build "sprint\v4\templates\$f") $dst; Write-Host "   created $dst" } else { Write-Host "   kept $dst" }
}

Step 'GitHub label v4.0'
& gh label create 'v4.0' --repo chicenwangs/lifetracker --color 5319e7 --description 'v4 sprint' 2>&1 | Out-Null

Step 'checks'
$free = [math]::Round((Get-PSDrive C).Free / 1GB, 1)
Write-Host "   free disk C: $free GB$(if ($free -lt 20) { '  (LOW: the sprint needs about 10 GB headroom)' })"
Write-Host "   node $(node --version), gh $((gh --version | Select-Object -First 1))"
Write-Host "Done. Start opencode in $build (see sprint\v4\PROMPT.md)."
