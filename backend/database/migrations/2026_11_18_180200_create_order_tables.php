<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('table_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('dining_table_id')->constrained()->restrictOnDelete();
            $table->foreignId('waiter_id')->nullable()->constrained('users')->nullOnDelete();
            // open -> bill_requested -> settled -> closed
            $table->string('status', 20)->default('open');
            $table->string('guest_token', 64)->unique();
            $table->unsignedTinyInteger('guests')->nullable();
            $table->timestamp('opened_at');
            $table->timestamp('bill_requested_at')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status']);
            $table->index(['dining_table_id', 'status']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('table_session_id')->constrained()->restrictOnDelete();
            $table->foreignId('dining_table_id')->constrained()->restrictOnDelete();
            $table->char('public_id', 26)->unique();
            $table->unsignedInteger('number');
            $table->date('business_date');
            $table->string('source', 12); // qr|staff
            $table->string('status', 20)->default('pending');
            $table->text('note')->nullable();
            $table->unsignedInteger('subtotal_cents')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('accepted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('served_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->timestamps();
            $table->unique(['branch_id', 'business_date', 'number']);
            $table->index(['branch_id', 'status']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('station_id')->nullable()->constrained()->nullOnDelete();
            // immutable price snapshot
            $table->string('name');
            $table->unsignedInteger('unit_price_cents');
            $table->unsignedSmallInteger('vat_rate_bps');
            $table->unsignedSmallInteger('quantity');
            $table->json('modifiers')->nullable();
            $table->unsignedInteger('line_total_cents');
            $table->string('note')->nullable();
            // queued|preparing|ready|served|cancelled (aggregate of its prep item)
            $table->string('status', 20)->default('queued');
            $table->timestamp('served_at')->nullable();
            $table->foreignId('served_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('prep_tickets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('station_id')->constrained()->restrictOnDelete();
            $table->string('status', 20)->default('queued'); // queued|preparing|ready|handed_off|cancelled
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamps();
            $table->unique(['order_id', 'station_id']);
            $table->index(['branch_id', 'station_id', 'status']);
        });

        Schema::create('prep_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prep_ticket_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('status', 20)->default('queued');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('handed_off_at')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('checks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('table_session_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('seq')->default(1);
            $table->string('status', 20)->default('open'); // open|settled|void
            $table->unsignedInteger('subtotal_cents')->default(0);
            $table->unsignedInteger('discount_cents')->default(0);
            $table->string('discount_reason')->nullable();
            $table->foreignId('discount_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('service_charge_cents')->default(0);
            $table->unsignedInteger('total_cents')->default(0);
            $table->unsignedInteger('paid_cents')->default(0);
            $table->unsignedInteger('tip_cents')->default(0);
            $table->unsignedInteger('version')->default(0);
            $table->timestamp('settled_at')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status']);
        });

        Schema::create('check_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('check_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->unsignedSmallInteger('quantity');
            $table->unsignedInteger('unit_price_cents');
            $table->unsignedSmallInteger('vat_rate_bps');
            $table->unsignedInteger('total_cents');
            $table->timestamp('voided_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('void_reason')->nullable();
            $table->timestamps();
        });

        Schema::create('pos_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('opened_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 12)->default('open');
            $table->unsignedInteger('opening_float_cents')->default(0);
            $table->unsignedInteger('expected_cash_cents')->nullable();
            $table->unsignedInteger('counted_cash_cents')->nullable();
            $table->integer('difference_cents')->nullable();
            $table->text('close_note')->nullable();
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status']);
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('check_id')->constrained()->restrictOnDelete();
            $table->foreignId('pos_shift_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('method', 12); // cash|card (SIMULATED)
            $table->string('mode', 12)->default('amount'); // amount|items|full
            $table->unsignedInteger('amount_cents');
            $table->unsignedInteger('tip_cents')->default(0);
            $table->unsignedInteger('tendered_cents')->nullable();
            $table->unsignedInteger('change_cents')->default(0);
            $table->string('status', 12)->default('captured'); // captured|refunded
            $table->string('reference', 64)->nullable();
            $table->boolean('is_simulated')->default(true);
            $table->timestamps();
            $table->index(['branch_id', 'created_at']);
        });

        Schema::create('payment_allocations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('payment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('check_item_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('amount_cents');
            $table->timestamps();
        });

        Schema::create('service_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->foreignId('table_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('dining_table_id')->constrained()->cascadeOnDelete();
            $table->string('type', 16); // bill|waiter
            $table->string('status', 16)->default('open'); // open|acknowledged|done
            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('done_at')->nullable();
            $table->timestamps();
            $table->index(['branch_id', 'status']);
        });
    }

    public function down(): void
    {
        foreach (['service_requests', 'payment_allocations', 'payments', 'pos_shifts', 'check_items', 'checks', 'prep_items', 'prep_tickets', 'order_items', 'orders', 'table_sessions'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
