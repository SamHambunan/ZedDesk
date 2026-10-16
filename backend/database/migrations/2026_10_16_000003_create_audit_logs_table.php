<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->timestamp('occurred_at');
            $table->string('classification', 16);
            $table->string('action', 100);
            $table->string('outcome', 32);
            $table->foreignId('organization_id')->nullable();
            $table->string('actor_type', 32)->nullable();
            $table->string('actor_id', 64)->nullable();
            $table->string('target_type', 64)->nullable();
            $table->string('target_id', 64)->nullable();
            $table->jsonb('changes')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->string('request_location', 150)->nullable();
            $table->index(['organization_id', 'occurred_at', 'id']);
            $table->index(['organization_id', 'action', 'occurred_at']);
            $table->index(['organization_id', 'actor_id', 'occurred_at']);
            $table->index(['organization_id', 'target_type', 'target_id', 'occurred_at'], 'audit_target_lookup');
            $table->index(['classification', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
