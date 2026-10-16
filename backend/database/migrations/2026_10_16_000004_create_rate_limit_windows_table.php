<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rate_limit_windows', function (Blueprint $table) {
            $table->char('key_hash', 64);
            $table->unsignedBigInteger('window_start');
            $table->unsignedInteger('requests');
            $table->unsignedInteger('writes');
            $table->primary(['key_hash', 'window_start']);
            $table->index('window_start');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rate_limit_windows');
    }
};
