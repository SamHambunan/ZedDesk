<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION increment_ticket_revision() RETURNS trigger AS $$
            BEGIN
                NEW.revision := OLD.revision + 1;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER tickets_increment_revision
                BEFORE UPDATE ON tickets
                FOR EACH ROW
                EXECUTE FUNCTION increment_ticket_revision();
            SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS tickets_increment_revision ON tickets; DROP FUNCTION IF EXISTS increment_ticket_revision();');
    }
};
