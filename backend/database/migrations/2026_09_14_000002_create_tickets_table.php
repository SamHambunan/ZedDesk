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
        Schema::create('tickets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->unsignedInteger('ticket_number');
            $table->foreignUuid('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('subject');
            $table->string('status')->default('new');
            $table->string('priority')->default('medium');
            $table->foreignId('assigned_team_id')->nullable()->constrained('teams')->nullOnDelete();
            $table->foreignId('assigned_member_id')->nullable()->constrained('organization_members')->nullOnDelete();
            $table->timestamp('first_replied_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->softDeletes();
            $table->timestamps();

            // Compound unique constraint per organization
            $table->unique(['organization_id', 'ticket_number']);

            // Targeted compound indexes for tenant queue filtering
            $table->index(['organization_id', 'status']);
            $table->index(['organization_id', 'priority']);
            $table->index(['organization_id', 'customer_id']);
            $table->index(['organization_id', 'assigned_member_id']);
            $table->index(['organization_id', 'assigned_team_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tickets');
    }
};
