<?php

test('cors allows requests from localhost:5173', function () {
    $response = $this->withHeaders([
        'Origin' => 'http://localhost:5173',
    ])->getJson('/api/health');

    $response->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
});

test('cors allows requests from organization subdomains on port 5173', function () {
    $response = $this->withHeaders([
        'Origin' => 'http://acme.localhost:5173',
    ])->getJson('/api/health');

    $response->assertHeader('Access-Control-Allow-Origin', 'http://acme.localhost:5173');
});
