<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\OrganizationMemberController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\WorkspaceController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    $probe = function (callable $check): string {
        try {
            $check();

            return 'connected';
        } catch (Throwable $e) {
            return 'error: '.$e->getMessage();
        }
    };
    $dbStatus = $probe(fn () => DB::connection()->getPdo());
    $redisStatus = $probe(fn () => Redis::connection()->ping());

    $isHealthy = ($dbStatus === 'connected' && $redisStatus === 'connected');

    return response()->json([
        'status' => $isHealthy ? 'ok' : 'degraded',
        'services' => [
            'database' => $dbStatus,
            'redis' => $redisStatus,
        ],
    ], $isHealthy ? 200 : 503);
});

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/organizations', [OrganizationController::class, 'index']);
    Route::post('/organizations', [OrganizationController::class, 'store']);
});

Route::get('/invitations/{token}', [InvitationController::class, 'show']);
Route::post('/invitations/{token}/accept', [InvitationController::class, 'accept']);

Route::middleware(['auth:sanctum', 'ensure.organization_member'])->group(function () {
    Route::get('/workspace', [WorkspaceController::class, 'show']);
    Route::get('/invitations', [InvitationController::class, 'index']);
    Route::post('/invitations', [InvitationController::class, 'store']);
    Route::delete('/invitations/{id}', [InvitationController::class, 'destroy']);

    Route::get('/organization-members', [OrganizationMemberController::class, 'index']);
    Route::get('/members', [OrganizationMemberController::class, 'index']);
    Route::get('/teams', [TeamController::class, 'index']);
    Route::post('/teams', [TeamController::class, 'store']);
    Route::get('/teams/{id}', [TeamController::class, 'show']);
    Route::put('/teams/{id}', [TeamController::class, 'update']);
    Route::delete('/teams/{id}', [TeamController::class, 'destroy']);
    Route::post('/teams/{id}/members', [TeamController::class, 'addMember']);
    Route::delete('/teams/{id}/members/{memberId}', [TeamController::class, 'removeMember']);
});
