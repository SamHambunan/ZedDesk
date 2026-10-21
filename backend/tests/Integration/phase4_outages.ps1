# Run from the repository root after seeding. Each probe restores its service
# even if an assertion fails. PHP is executed only inside Docker Compose.
$ErrorActionPreference = 'Stop'

function Invoke-Recovery([string[]] $Arguments) {
    $output = & docker compose exec -T backend php tests/Integration/phase4_recovery.php @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Recovery probe failed: $($output -join ' ')"
    }
    return ($output -join "`n" | ConvertFrom-Json)
}

$results = @()
foreach ($service in @('redis', 'reverb', 'delivery-worker')) {
    & docker compose stop $service | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not stop $service" }
    try {
        $written = Invoke-Recovery -Arguments @('write')
        if ($written.pending_signals -lt 1) {
            throw "No durable signal remained pending during $service outage"
        }
    } finally {
        & docker compose start $service | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not restore $service" }
    }
    $recovered = Invoke-Recovery -Arguments @('wait', ($written.signal_ids -join ','))
    $results += [pscustomobject]@{
        service = $service
        message_id = $written.message_id
        pending_signals = $written.pending_signals
        resumed_in_seconds = $recovered.resumed_in_seconds
        delivered_signals = $recovered.delivered
    }
}
$results | ConvertTo-Json -Depth 3
