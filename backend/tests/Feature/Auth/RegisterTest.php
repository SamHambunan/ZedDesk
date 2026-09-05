<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

test('user can register with valid credentials and receives a token', function () {
    $response = $this->postJson('/api/register', [
        'name' => 'Alice Admin',
        'email' => 'alice@example.com',
        'password' => 'Password123!',
        'password_confirmation' => 'Password123!',
    ]);

    $response->assertStatus(201)
        ->assertJsonStructure([
            'user' => [
                'id',
                'name',
                'email',
                'created_at',
                'updated_at',
            ],
            'token',
        ]);

    expect($response->json('user.email'))->toBe('alice@example.com')
        ->and($response->json('user.name'))->toBe('Alice Admin')
        ->and($response->json('token'))->toBeString();

    $this->assertDatabaseHas('users', [
        'email' => 'alice@example.com',
        'name' => 'Alice Admin',
    ]);

    $user = User::where('email', 'alice@example.com')->first();
    expect(Hash::check('Password123!', $user->password))->toBeTrue();
});

test('registration fails when required fields are missing', function () {
    $response = $this->postJson('/api/register', []);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['name', 'email', 'password']);
});

test('registration fails with invalid email format', function () {
    $response = $this->postJson('/api/register', [
        'name' => 'Bob Agent',
        'email' => 'not-an-email',
        'password' => 'Password123!',
        'password_confirmation' => 'Password123!',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

test('registration fails when email is already taken', function () {
    User::factory()->create([
        'email' => 'existing@example.com',
    ]);

    $response = $this->postJson('/api/register', [
        'name' => 'Copycat',
        'email' => 'existing@example.com',
        'password' => 'Password123!',
        'password_confirmation' => 'Password123!',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['email']);
});

test('registration fails when password is too short or confirmation does not match', function () {
    $response = $this->postJson('/api/register', [
        'name' => 'Short Pass',
        'email' => 'short@example.com',
        'password' => 'short',
        'password_confirmation' => 'short_diff',
    ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});
