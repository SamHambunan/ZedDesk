<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('request_idempotency', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->string('actor_type');
            $table->string('actor_id');
            $table->string('operation');
            $table->string('target_id');
            $table->char('key_hash', 64);
            $table->char('fingerprint', 64);
            $table->unsignedSmallInteger('response_status')->nullable();
            $table->text('encrypted_response')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();

            $table->unique(['organization_id', 'actor_type', 'actor_id', 'operation', 'target_id', 'key_hash'], 'request_idempotency_identity');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('request_idempotency');
    }
};
