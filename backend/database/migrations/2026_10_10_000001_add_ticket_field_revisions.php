<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->unsignedBigInteger('status_revision')->default(1);
            $table->unsignedBigInteger('priority_revision')->default(1);
        });

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION increment_ticket_revision() RETURNS trigger AS $$
            BEGIN
                NEW.revision := OLD.revision + 1;
                NEW.status_revision := OLD.status_revision + CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN 1 ELSE 0 END;
                NEW.priority_revision := OLD.priority_revision + CASE WHEN NEW.priority IS DISTINCT FROM OLD.priority THEN 1 ELSE 0 END;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION increment_ticket_revision() RETURNS trigger AS $$
            BEGIN
                NEW.revision := OLD.revision + 1;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
            SQL);

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropColumn(['status_revision', 'priority_revision']);
        });
    }
};
