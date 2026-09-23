<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class OrganizationController extends Controller
{
    public const RESERVED_SLUGS = [
        'api', 'admin', 'www', 'central', 'app', 'support', 'mail', 'billing',
        'help', 'test', 'dashboard', 'login', 'register', 'status', 'docs',
        'assets', 'static', 'cdn', 'auth', 'account', 'portal',
    ];

    public function index(Request $request): JsonResponse
    {
        $organizations = $request->user()->organizations()
            ->get()
            ->map(function (Organization $org) {
                return [
                    'id' => $org->id,
                    'name' => $org->name,
                    'slug' => $org->slug,
                    'role' => $org->pivot->role,
                    'created_at' => $org->created_at,
                    'updated_at' => $org->updated_at,
                ];
            });

        return response()->json($organizations);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'required',
                'string',
                'min:3',
                'max:63',
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                'unique:organizations,slug',
                Rule::notIn(self::RESERVED_SLUGS),
            ],
        ]);

        $user = $request->user();

        $organization = DB::transaction(function () use ($validated, $user) {
            $org = Organization::create([
                'name' => $validated['name'],
                'slug' => $validated['slug'],
            ]);

            OrganizationMember::create([
                'organization_id' => $org->id,
                'user_id' => $user->id,
                'role' => Role::ADMIN->value,
            ]);

            return $org;
        });

        return response()->json([
            'organization' => $organization,
            'role' => Role::ADMIN->value,
        ], 201);
    }

    public function checkSlug(Request $request): JsonResponse
    {
        $slug = strtolower(trim((string) $request->query('slug', '')));

        if (! $slug || strlen($slug) < 3 || strlen($slug) > 63) {
            return response()->json([
                'available' => false,
                'message' => 'Subdomain must be between 3 and 63 characters.',
            ]);
        }

        if (in_array($slug, self::RESERVED_SLUGS, true)) {
            return response()->json([
                'available' => false,
                'message' => 'This subdomain is reserved by the system.',
            ]);
        }

        if (! preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            return response()->json([
                'available' => false,
                'message' => 'Subdomain must contain only lowercase alphanumeric characters and hyphens.',
            ]);
        }

        $exists = Organization::where('slug', $slug)->exists();

        return response()->json([
            'available' => ! $exists,
            'message' => $exists ? 'This subdomain is already taken.' : 'Subdomain is valid and available',
        ]);
    }
}
