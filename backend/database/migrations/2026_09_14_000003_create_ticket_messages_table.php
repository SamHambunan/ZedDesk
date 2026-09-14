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
        Schema::create('ticket_messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignUuid('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->string('message_type');
            $table->string('author_type');
            $table->string('author_id');
            $table->text('body');
            $table->timestamps();

            // Indexes for scoping, ordering, filtering, and polymorphic lookups
            $table->index(['organization_id', 'ticket_id']);
            $table->index(['ticket_id', 'created_at']);
            $table->index(['ticket_id', 'message_type']);
            $table->index(['author_type', 'author_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ticket_messages');
    }
};
