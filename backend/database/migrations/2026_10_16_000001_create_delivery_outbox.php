<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('organization_id')->index();
            $table->string('kind');
            $table->uuid('ticket_id')->nullable();
            $table->uuid('customer_id')->nullable();
            $table->unsignedBigInteger('recipient_member_id')->nullable();
            $table->jsonb('envelope');
            $table->timestamp('available_at')->index();
            $table->uuid('reservation_token')->nullable();
            $table->timestamp('reserved_until')->nullable();
            $table->unsignedInteger('failures')->default(0);
            $table->unsignedInteger('infrastructure_failures')->default(0);
            $table->string('last_error')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('quarantined_at')->nullable();
            $table->timestamps();
            $table->index(['delivered_at', 'quarantined_at', 'reserved_until']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_outbox');
    }
};
