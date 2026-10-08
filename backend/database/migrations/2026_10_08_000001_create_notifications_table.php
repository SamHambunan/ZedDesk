<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('recipient_member_id')->constrained('organization_members')->cascadeOnDelete();
            $table->foreignUuid('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->string('activity_type');
            $table->jsonb('latest_activity_metadata')->default('{}');
            $table->timestamp('latest_activity_at');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'recipient_member_id', 'latest_activity_at']);
        });

        DB::statement('CREATE UNIQUE INDEX notifications_one_unread_per_member_ticket ON notifications (recipient_member_id, ticket_id) WHERE read_at IS NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
