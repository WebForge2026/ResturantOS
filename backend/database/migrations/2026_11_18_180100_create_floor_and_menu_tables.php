<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('floor_areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('kind', 20)->default('indoor'); // indoor|terrace|bar|private
            $table->unsignedInteger('width')->default(1200);
            $table->unsignedInteger('height')->default(800);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('dining_tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('floor_area_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('number');
            $table->string('label');
            $table->unsignedTinyInteger('seats')->default(4);
            $table->string('shape', 12)->default('square'); // round|square|rect
            $table->integer('x')->default(0);
            $table->integer('y')->default(0);
            $table->unsignedInteger('width')->default(90);
            $table->unsignedInteger('height')->default(90);
            $table->smallInteger('rotation')->default(0);
            $table->boolean('is_active')->default(true);
            $table->string('qr_token', 64)->unique();
            $table->timestamp('qr_rotated_at')->nullable();
            $table->timestamps();
            $table->unique(['branch_id', 'number']);
        });

        Schema::create('stations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 32);
            $table->string('display', 12)->default('kitchen'); // kitchen|bar
            $table->string('color', 9)->default('#ff2a2a');
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->unique(['branch_id', 'code']);
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['branch_id', 'slug']);
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            $table->foreignId('station_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('sku', 64)->nullable();
            $table->text('description')->nullable();
            $table->text('ingredients')->nullable();
            $table->json('allergens')->nullable();
            $table->unsignedInteger('price_cents');
            $table->unsignedSmallInteger('vat_rate_bps')->default(2000);
            $table->string('portion', 64)->nullable();
            $table->string('image_url')->nullable();
            $table->json('art')->nullable();
            $table->json('nutrition')->nullable();
            $table->boolean('is_available')->default(true);
            $table->boolean('is_published')->default(true);
            $table->boolean('auto_unavailable_on_low_stock')->default(false);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->softDeletes();
            $table->index(['branch_id', 'category_id', 'sort']);
            $table->unique(['branch_id', 'sku']);
        });

        Schema::create('modifier_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('kind', 12)->default('modifier'); // variant|modifier
            $table->unsignedTinyInteger('min_select')->default(0);
            $table->unsignedTinyInteger('max_select')->default(1);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('modifier_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('modifier_group_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->integer('price_delta_cents')->default(0);
            $table->boolean('is_available')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('modifier_options');
        Schema::dropIfExists('modifier_groups');
        Schema::dropIfExists('products');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('stations');
        Schema::dropIfExists('dining_tables');
        Schema::dropIfExists('floor_areas');
    }
};
