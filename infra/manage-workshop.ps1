[CmdletBinding()]
param(
    [ValidateSet('Status', 'Close', 'Open', 'Pause', 'Resume', 'Stop', 'PurgeExpired', 'PurgeEvent')]
    [string]$Action = 'Status',
    [switch]$Apply,
    [string]$EventId = 'workshop-20261018',
    [string]$ResourceGroup = 'rg-decision-room-dev',
    [string]$AppName = 'app-decision-room-ralexiou-04dbd6',
    [string]$StorageName = 'stdecisionroom04dbd6',
    [string]$Subscription = '04dbd670-839c-4a25-aad5-436f7215e881'
)
$ErrorActionPreference = 'Stop'
if ($EventId -notmatch '^[a-zA-Z0-9-]{1,80}$') { throw 'Invalid event ID.' }
function Invoke-Az {
    $result = & az @args --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw 'Azure operator command failed.' }
    return $result
}
if ($Action -eq 'Status') {
    Invoke-Az webapp show --subscription $Subscription -g $ResourceGroup -n $AppName --query '{state:state,host:defaultHostName}' -o json
    Invoke-Az webapp config appsettings list --subscription $Subscription -g $ResourceGroup -n $AppName --query "[?starts_with(name, 'WORKSHOP_') || name=='EVENT_REQUEST_LIMIT'].{name:name,value:value}" -o json
    return
}
if (!$Apply) { Write-Host "Preview only: $Action on $AppName, event $EventId. Pass -Apply to execute."; return }
if ($Action -eq 'Stop') {
    Invoke-Az webapp stop --subscription $Subscription -g $ResourceGroup -n $AppName
    Write-Warning 'The web app is stopped, but B1 hosting still bills while the plan exists.'
} elseif ($Action -in @('PurgeExpired', 'PurgeEvent')) {
    $filter = "PartitionKey eq '$EventId'"
    do {
        $queryArgs = @('storage', 'entity', 'query', '--account-name', $StorageName, '--auth-mode', 'login', '--table-name', 'workshop', '--filter', $filter, '--output', 'json')
        if ($next) { $queryArgs += @('--marker', "nextpartitionkey=$($next.nextpartitionkey)", "nextrowkey=$($next.nextrowkey)") }
        $page = (Invoke-Az @queryArgs) | ConvertFrom-Json
        foreach ($row in $page.items) {
            $value = $row.payload | ConvertFrom-Json
            if ($Action -eq 'PurgeEvent' -or ($value.expires -and $value.expires -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())) {
                Invoke-Az storage entity delete --account-name $StorageName --auth-mode login --table-name workshop --partition-key $EventId --row-key $row.RowKey --if-match $row.etag --output none
            }
        }
        $next = $page.nextMarker
    } while ($next)
    Write-Host 'Purge complete. Expired-session purge keeps browser quotas and event counters; event purge removes all event data.'
} else {
    $setting = switch ($Action) {
        Close { 'WORKSHOP_CLOSED=true' }
        Open { 'WORKSHOP_CLOSED=false' }
        Pause { 'WORKSHOP_PAUSED=true' }
        Resume { 'WORKSHOP_PAUSED=false' }
    }
    Invoke-Az webapp config appsettings set --subscription $Subscription -g $ResourceGroup -n $AppName --settings $setting --output none
    Write-Host "$setting saved. App Service restarts to apply settings; already accepted inference may still complete."
}
