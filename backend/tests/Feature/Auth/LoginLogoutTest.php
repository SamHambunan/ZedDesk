<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

test('user can login with valid credentials and receive a token', function () {
    $user = User::factory()->create([
        'email' => 'login_test@example.com',
        'password' => Hash::make('CorrectPassword123!'),
    ]);

    $response = $this->postJson('/api/login', [
        'email' => 'login_test@example.com',
        'password' => 'CorrectPassword123!',
    ]);

    $response->assertStatus(200)
        ->assertJsonStructure([
            'user' => [
                'id',
                'name',
                'email',
            ],
            'token',
        ]);

    expect($response->json('user.id'))->toBe($user->id)
        ->and($response->json('token'))->toBeString();
});

test('login fails with invalid credentials', function () {
    User::factory()->create([
        'email' => 'wrong_pass@example.com',
        'password' => Hash::make('CorrectPassword123!'),
    ]);

    $response = $this->postJson('/api/login', [
        'email' => 'wrong_pass@example.com',
        'password' => 'WrongPassword!',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

test('login fails when required fields are missing', function () {
    $response = $this->postJson('/api/login', []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email', 'password']);
});

test('authenticated user can logout and revoke token', function () {
    $user = User::factory()->create();
    $token = $user->createToken('test_token')->plainTextToken;

    $response = $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/logout');

    $response->assertStatus(200)
        ->assertJson([
            'message' => 'Logged out successfully',
        ]);

    expect($user->tokens()->count())->toBe(0);
});

test('unauthenticated user cannot logout', function () {
    $response = $this->postJson('/api/logout');

    $response->assertStatus(401);
});
