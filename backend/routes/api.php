<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    $dbStatus = 'disconnected';
    try {
        Illuminate\Support\Facades\DB::connection()->getPdo();
        $dbStatus = 'connected';
    } catch (\Throwable $e) {
        $dbStatus = 'error: ' . $e->getMessage();
    }

    $redisStatus = 'disconnected';
    try {
        Illuminate\Support\Facades\Redis::connection()->ping();
        $redisStatus = 'connected';
    } catch (\Throwable $e) {
        $redisStatus = 'error: ' . $e->getMessage();
    }

    $isHealthy = ($dbStatus === 'connected' && $redisStatus === 'connected');

    return response()->json([
        'status' => $isHealthy ? 'ok' : 'degraded',
        'services' => [
            'database' => $dbStatus,
            'redis' => $redisStatus,
        ],
    ], $isHealthy ? 200 : 503);
});

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
