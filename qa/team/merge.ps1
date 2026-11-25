# LEAD only. Safe merge of one PR into main. Refuses unless every gate holds. Never use gh pr merge directly.
#   merge.ps1 -Pr 412
# Gates: open, base main, not draft, mergeable, >= 1 check and every check passed, migration PRs need a passing
# migration-check for the PR's exact head commit. Merges from a non-repo folder (the v3.2 junction incident), then
# deletes the remote branch through the API and fetches.
param([Parameter(Mandatory)][int]$Pr)
. "$PSScriptRoot\lib.ps1"
$ErrorActionPreference = 'Continue'
$team = Get-Team
$repo = $team.repo

$v = gh pr view $Pr -R $repo --json state,isDraft,mergeable,headRefName,headRefOid,baseRefName,files,statusCheckRollup,title | ConvertFrom-Json
if (-not $v) { "REFUSED: cannot read PR $Pr"; exit 1 }
$why = @()
if ($v.state -ne 'OPEN') { $why += "state is $($v.state)" }
if ($v.baseRefName -ne 'main') { $why += "base is $($v.baseRefName), not main" }
if ($v.isDraft) { $why += 'draft' }
if ($v.mergeable -ne 'MERGEABLE') { $why += "mergeable=$($v.mergeable) (conflict or still computing: rebase / wait)" }
$checks = @($v.statusCheckRollup)
if ($checks.Count -eq 0) { $why += 'no CI checks reported yet' }
foreach ($c in $checks) {
	$name = if ($c.name) { $c.name } else { $c.context }
	if ($c.PSObject.Properties.Name -contains 'conclusion') {
		if ($c.status -ne 'COMPLETED') { $why += "check '$name' not finished" }
		elseif (@('SUCCESS', 'SKIPPED', 'NEUTRAL') -notcontains $c.conclusion) { $why += "check '$name' = $($c.conclusion)" }
	} elseif ($c.state -and $c.state -ne 'SUCCESS') { $why += "status '$name' = $($c.state)" }
}
$mig = @($v.files | Where-Object { $_.path -like 'app/drizzle/*.sql' })
if ($mig.Count) {
	$ok = Read-JsonFile (Join-Path $team.root "runs\migrations\pr-$Pr.json")
	if (-not $ok -or -not $ok.ok -or $ok.sha -ne $v.headRefOid) { $why += "migration PR: no passing migration-check for head $($v.headRefOid) (run migration-check.mjs -Pr $Pr on that commit)" }
}
if ($why.Count) { "REFUSED PR ${Pr}:"; $why | ForEach-Object { " - $_" }; exit 1 }

Push-Location $team.root
try {
	gh pr merge $Pr -R $repo --merge --subject "Merge pull request #$Pr from $($v.headRefName)"
	if ($LASTEXITCODE) { "FAILED: gh pr merge exit $LASTEXITCODE"; exit 1 }
	gh api -X DELETE "repos/$repo/git/refs/heads/$($v.headRefName)" | Out-Null
} finally { Pop-Location }

$m = gh pr view $Pr -R $repo --json mergeCommit,state | ConvertFrom-Json
& "$PSScriptRoot\lock.ps1" -Agent LEAD -Take git -WaitMin 10 | Out-Null
try { git -C (Join-Path $team.root 'wt\LEAD') fetch origin --prune --quiet } finally { & "$PSScriptRoot\lock.ps1" -Agent LEAD -Release git | Out-Null }
Add-JsonLine (Join-Path $team.root 'coord\LEAD.out.jsonl') ([ordered]@{ ts = (Get-NowIso); from = 'LEAD'; to = 'ALL'; type = 'merged'; pr = $Pr; branch = $v.headRefName; commit = $m.mergeCommit.oid; text = $v.title })
Set-Heartbeat $team 'LEAD'
"MERGED PR $Pr as $($m.mergeCommit.oid) ($($m.state)); remote branch $($v.headRefName) deleted; origin fetched"
