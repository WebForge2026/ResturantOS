<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('contact_name')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('vat_number', 32)->nullable();
            $table->timestamps();
        });

        Schema::create('ingredients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('unit', 8); // g|ml|pcs (canonical units)
            // Quantities in canonical unit, 3 decimals
            $table->decimal('on_hand', 14, 3)->default(0);
            $table->decimal('reserved', 14, 3)->default(0);
            $table->decimal('min_level', 14, 3)->default(0);
            $table->decimal('reorder_qty', 14, 3)->default(0);
            $table->unsignedInteger('cost_per_unit_millicents')->default(0); // 1/1000 cent per unit
            $table->string('location')->default('Основен склад');
            $table->timestamps();
            $table->unique(['branch_id', 'name']);
        });

        Schema::create('recipe_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 12, 3);
            $table->timestamps();
            $table->unique(['product_id', 'ingredient_id']);
        });

        Schema::create('purchase_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reference')->nullable();
            $table->unsignedInteger('total_cents')->default(0);
            $table->timestamp('received_at');
            $table->timestamps();
        });

        Schema::create('purchase_receipt_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_receipt_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->unsignedInteger('total_cents')->default(0);
            $table->timestamps();
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained()->cascadeOnDelete();
            // reserve|release|consume|receipt|adjust|waste|opening
            $table->string('type', 16);
            // signed delta applied to on_hand (consume/receipt/adjust/waste/opening)
            // or to reserved (reserve/release)
            $table->decimal('quantity', 14, 3);
            $table->decimal('on_hand_after', 14, 3);
            $table->decimal('reserved_after', 14, 3);
            $table->foreignId('order_item_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('purchase_receipt_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note')->nullable();
            // Idempotency guard: one movement of a type per order item & ingredient
            $table->string('dedupe_key', 120)->nullable()->unique();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['branch_id', 'ingredient_id', 'created_at']);
        });
    }

    public function down(): void
    {
        foreach (['stock_movements', 'purchase_receipt_items', 'purchase_receipts', 'recipe_items', 'ingredients', 'suppliers'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
