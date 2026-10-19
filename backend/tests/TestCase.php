<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['broadcasting.default' => 'null']);
        // Redis windows outlive database rollbacks; isolate each HTTP test's allowances.
        config(['rate_limits.key_prefix' => 'test:'.Str::random(20)]);
    }
}
