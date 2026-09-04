<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

test('health check endpoint returns ok status and verifies database and redis connectivity', function () {
    $response = $this->getJson('/api/health');

    $response->assertStatus(200)
        ->assertJson([
            'status' => 'ok',
            'services' => [
                'database' => 'connected',
                'redis' => 'connected',
            ],
        ]);
});
