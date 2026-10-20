# Run from the repository root after phase4_workload.php seed.
# The regular delivery worker is stopped so these three jobs run in one worker process.
$ErrorActionPreference = 'Stop'

& docker compose stop delivery-worker | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not stop delivery-worker' }
try {
    $queued = & docker compose exec -T backend php tests/Integration/phase4_isolation.php enqueue
    if ($LASTEXITCODE -ne 0) { throw "Could not queue isolation signals: $($queued -join ' ')" }
    $signalIds = (($queued -join "`n") | ConvertFrom-Json).signal_ids
    & docker compose exec -T backend php artisan queue:work redis --queue=outbox --stop-when-empty --max-jobs=3 --tries=1 --timeout=20 --sleep=1
    if ($LASTEXITCODE -ne 0) { throw 'Isolation worker exited with an error' }
    & docker compose exec -T backend php tests/Integration/phase4_isolation.php verify ($signalIds -join ',')
    if ($LASTEXITCODE -ne 0) { throw 'Isolation verification failed' }
} finally {
    & docker compose start delivery-worker | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restore delivery-worker' }
}
