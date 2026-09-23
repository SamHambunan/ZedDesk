<?php

use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CustomerPortalController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\OrganizationController;
use App\Http\Controllers\Api\OrganizationMemberController;
use App\Http\Controllers\Api\TagController;
use App\Http\Controllers\Api\TeamController;
use App\Http\Controllers\Api\TicketController;
use App\Http\Controllers\Api\TicketPriorityController;
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
    Route::get('/organizations/check-slug', [OrganizationController::class, 'checkSlug']);
    Route::get('/user/invitations', [InvitationController::class, 'userInvitations']);
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

    Route::get('/tickets', [TicketController::class, 'index']);
    Route::get('/tickets/{ticket}', [TicketController::class, 'show']);
    Route::post('/tickets/{ticket}/messages', [TicketController::class, 'storeMessage']);
    Route::post('/tickets/{ticket}/assign', [TicketController::class, 'assign']);
    Route::post('/tickets/{ticket}/claim', [TicketController::class, 'claim']);
    Route::patch('/tickets/{ticket}/status', [TicketController::class, 'updateStatus']);
    Route::patch('/tickets/{ticket}/priority', [TicketPriorityController::class, 'update']);
    Route::delete('/tickets/{ticket}', [TicketController::class, 'destroy']);
    Route::post('/tickets/{ticket}/restore', [TicketController::class, 'restore']);

    Route::get('/tags', [TagController::class, 'index']);
    Route::post('/tags', [TagController::class, 'store']);
    Route::get('/tickets/{ticket}/tags', [TagController::class, 'ticketTags']);
    Route::post('/tickets/{ticket}/tags', [TagController::class, 'attachToTicket']);
    Route::delete('/tickets/{ticket}/tags/{tag}', [TagController::class, 'detachFromTicket']);

    Route::get('/attachments/{id}/download', [AttachmentController::class, 'download']);
    Route::post('/tickets/{ticket}/messages/{message}/attachments', [AttachmentController::class, 'upload']);
});

Route::prefix('portal')->group(function () {
    Route::post('/tickets', [CustomerPortalController::class, 'store']);
    Route::post('/magic-link', [CustomerPortalController::class, 'magicLink']);

    Route::middleware('customer.token')->group(function () {
        Route::get('/tickets/{ticket}', [CustomerPortalController::class, 'show']);
        Route::post('/tickets/{ticket}/reply', [CustomerPortalController::class, 'reply']);
        Route::get('/tickets/{ticket}/attachments/{attachment}', [CustomerPortalController::class, 'downloadAttachment']);
        Route::get('/auth/verify', [CustomerPortalController::class, 'verify']);
    });
});
