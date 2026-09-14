<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('ticket_assignments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignUuid('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->foreignId('team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->foreignId('member_id')->nullable()->constrained('organization_members')->nullOnDelete();
            $table->foreignId('assigned_by_id')->nullable()->constrained('organization_members')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            // Targeted compound indexes for audit trail filtering and tenant isolation
            $table->index(['organization_id', 'ticket_id']);
            $table->index(['ticket_id', 'created_at']);
            $table->index(['organization_id', 'member_id']);
            $table->index(['organization_id', 'team_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticket_assignments');
    }
};
