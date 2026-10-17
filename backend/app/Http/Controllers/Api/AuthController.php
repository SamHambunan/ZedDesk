<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => $validated['password'],
            ]);

            $token = $user->createToken('auth_token')->plainTextToken;

            app(AuditLogWriter::class)->recordRegistration($user, $request->path());
            app(AuditLogWriter::class)->recordCredentialIssued($user, 'auth_token', null, $request->path());

            return response()->json([
                'user' => $user,
                'token' => $token,
            ], 201);
        });
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            try {
                app(AuditLogWriter::class)->recordLoginDenied($user, $request->path());
            } catch (\Throwable $e) {
                report($e);
            }

            throw ValidationException::withMessages([
                'email' => [trans('auth.failed')],
            ]);
        }

        return DB::transaction(function () use ($user, $request) {
            $token = $user->createToken('auth_token')->plainTextToken;

            app(AuditLogWriter::class)->recordLoginSuccess($user, $request->path());
            app(AuditLogWriter::class)->recordCredentialIssued($user, 'auth_token', null, $request->path());

            return response()->json([
                'user' => $user,
                'token' => $token,
            ], 200);
        });
    }

    public function logout(Request $request): JsonResponse
    {
        return DB::transaction(function () use ($request) {
            $user = $request->user();
            $tokenId = $user->currentAccessToken()?->id;
            $user->currentAccessToken()->delete();

            app(AuditLogWriter::class)->recordLogout($user, $tokenId ? (string) $tokenId : null, $request->path());

            return response()->json([
                'message' => 'Logged out successfully',
            ]);
        });
    }
}
