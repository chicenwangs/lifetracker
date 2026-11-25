# Send one message. Appends a JSON line to coord\<From>.out.jsonl (each agent writes only its own file).
# Example: msg.ps1 -From W2 -To W5 -Type ready_for_review -Pr 19 -Branch feat/v4-pr19-mention -Commit abc1234 -Tests "lint ok | check 0 errors | unit 431 passed | e2e 14 passed" -Text "..."
# To = LEAD | W1..W5 | ALL | SUPERVISOR. Types: see TEAM-LOOP.md section 4.
param(
	[Parameter(Mandatory)][string]$From,
	[Parameter(Mandatory)][string]$To,
	[Parameter(Mandatory)][string]$Type,
	[int]$Pr = 0,
	[int]$Issue = 0,
	[string]$Branch = '',
	[string]$Commit = '',
	[string]$Text = '',
	[string]$Tests = '',
	[string[]]$Items = @(),
	[string]$Phase = '',
	[string]$Result = '',
	[string]$File = ''
)
. "$PSScriptRoot\lib.ps1"
$team = Get-Team
if (-not (Test-Slot $team $From)) { throw "From must be one of: $((Get-Slots $team) -join ', ')" }
$okTo = @(Get-Slots $team) + @('ALL', 'SUPERVISOR')
if ($okTo -notcontains $To) { throw "To must be one of: $($okTo -join ', ')" }
if ($Type -eq 'phase_done' -and $From -ne 'LEAD') { throw 'only LEAD sends phase_done' }
$m = [ordered]@{ ts = (Get-NowIso); from = $From; to = $To; type = $Type }
if ($Pr) { $m.pr = $Pr }
if ($Issue) { $m.issue = $Issue }
foreach ($k in 'Branch', 'Commit', 'Text', 'Tests', 'Phase', 'Result', 'File') {
	$v = (Get-Variable $k).Value
	if ($v) { $m[$k.ToLower()] = $v }
}
if ($Items.Count) { $m.items = $Items }
Add-JsonLine (Join-Path $team.root "coord\$From.out.jsonl") $m
Set-Heartbeat $team $From
"SENT $Type -> $To"
