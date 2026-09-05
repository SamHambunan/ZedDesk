<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    $probe = function (callable $check): string {
        try {
            $check();
            return 'connected';
        } catch (\Throwable $e) {
            return 'error: ' . $e->getMessage();
        }
    };
    $dbStatus = $probe(fn () => Illuminate\Support\Facades\DB::connection()->getPdo());
    $redisStatus = $probe(fn () => Illuminate\Support\Facades\Redis::connection()->ping());

    $isHealthy = ($dbStatus === 'connected' && $redisStatus === 'connected');
    return response()->json([
        'status' => $isHealthy ? 'ok' : 'degraded',
        'services' => [
            'database' => $dbStatus,
            'redis' => $redisStatus,
        ],
    ], $isHealthy ? 200 : 503);
});

Route::post('/register', [App\Http\Controllers\Api\AuthController::class, 'register']);
Route::post('/login', [App\Http\Controllers\Api\AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [App\Http\Controllers\Api\AuthController::class, 'logout']);
    Route::get('/organizations', [App\Http\Controllers\Api\OrganizationController::class, 'index']);
    Route::post('/organizations', [App\Http\Controllers\Api\OrganizationController::class, 'store']);
});
