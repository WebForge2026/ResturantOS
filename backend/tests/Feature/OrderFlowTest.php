<?php

namespace Tests\Feature;

use App\Models\Check;
use App\Models\Ingredient;
use App\Models\Order;
use App\Models\PrepItem;
use App\Models\StockMovement;
use App\Models\TableSession;

class OrderFlowTest extends NoarTestCase
{
    public function test_full_table_8_scenario_from_qr_to_cleared_table(): void
    {
        $beefBefore = (float) Ingredient::where('name', 'Телешка кайма')->value('on_hand');

        // 1. Guest scans table 8 and orders 2 burgers, 1 salad, 2 colas
        $res = $this->guestOrder(8, $this->scenarioItems(), 'без лук на бургерите')->assertCreated();
        $guest = $res->json('guest_token');
        $publicId = $res->json('order.public_id');
        $this->assertSame('accepted', $res->json('order.status')); // auto-accept mode
        // server-side prices: 2×15.90 + 12.90 + 2×3.50 = 51.70
        $this->assertSame(5170, $res->json('order.total_cents'));

        $order = Order::where('public_id', $publicId)->firstOrFail();
        $session = TableSession::find($order->table_session_id);
        $check = Check::where('table_session_id', $session->id)->firstOrFail();
        // check accumulates immediately on acceptance, not on readiness
        $this->assertSame(5170, $check->total_cents);

        // 2. routing: hot kitchen gets burgers, cold gets salad, bar gets colas
        $this->actingAsEmail('kitchen@noar.local');
        $kds = $this->getJson($this->b('/kds?display=kitchen'))->assertOk()->json('tickets');
        $kitchenNames = collect($kds)->flatMap(fn ($t) => collect($t['items'])->pluck('name'))->all();
        $this->assertEqualsCanonicalizing(['NOAR Смаш бургер', 'Цезар с пушено пиле'], $kitchenNames);
        $this->assertEqualsCanonicalizing(['Топла кухня', 'Студена кухня'], collect($kds)->pluck('station.name')->all());
        // kitchen cannot open the bar display
        $this->getJson($this->b('/kds?display=bar'))->assertForbidden();

        $this->actingAsEmail('bar@noar.local');
        $bar = $this->getJson($this->b('/kds?display=bar'))->assertOk()->json('tickets');
        $this->assertCount(1, $bar);
        $this->assertSame('Кока-Кола 330 мл', $bar[0]['items'][0]['name']);

        // 3. bar marks drinks ready → order partially ready, burgers unaffected
        $this->patchJson($this->b('/prep-tickets/'.$bar[0]['id']), ['status' => 'ready'])->assertOk();
        $this->assertSame('partially_ready', $order->fresh()->status);
        $burgerPrep = PrepItem::whereHas('orderItem', fn ($q) => $q->where('order_id', $order->id)->where('name', 'NOAR Смаш бургер'))->first();
        $this->assertSame('queued', $burgerPrep->status);
        // bartender cannot touch kitchen items
        $this->patchJson($this->b('/prep-items/'.$burgerPrep->id), ['status' => 'ready'])->assertForbidden();

        // guest sees accurate status
        $this->getJson("/api/v1/public/sessions/{$guest}")->assertOk()->assertJsonPath('orders.0.status', 'partially_ready');

        // 4. kitchen prepares & readies items individually
        $this->actingAsEmail('kitchen@noar.local');
        $this->patchJson($this->b('/prep-items/'.$burgerPrep->id), ['status' => 'preparing'])->assertOk();
        $this->patchJson($this->b('/prep-items/'.$burgerPrep->id), ['status' => 'ready'])->assertOk();
        $this->assertSame('partially_ready', $order->fresh()->status); // salad still queued
        $salad = PrepItem::whereHas('orderItem', fn ($q) => $q->where('order_id', $order->id)->where('name', 'Цезар с пушено пиле'))->first();
        $this->patchJson($this->b('/prep-items/'.$salad->id), ['status' => 'ready'])->assertOk();
        $this->assertSame('ready', $order->fresh()->status);

        // stock consumed exactly once at the "ready" event
        $this->assertEqualsWithDelta($beefBefore - 360, (float) Ingredient::where('name', 'Телешка кайма')->value('on_hand'), 0.001);
        $this->patchJson($this->b('/prep-items/'.$burgerPrep->id), ['status' => 'ready'])->assertOk(); // duplicate event
        $this->assertEqualsWithDelta($beefBefore - 360, (float) Ingredient::where('name', 'Телешка кайма')->value('on_hand'), 0.001);

        // 5. ready ≠ served: waiter sees the ready task and marks it served
        $this->actingAsEmail('waiter@noar.local');
        $feed = $this->getJson($this->b('/waiter/feed'))->assertOk()->json('ready');
        $this->assertSame($order->id, $feed[0]['order_id']);
        $this->getJson("/api/v1/public/sessions/{$guest}")->assertJsonPath('orders.0.status', 'ready');
        $this->postJson($this->b("/orders/{$order->id}/serve"))->assertOk();
        $this->assertSame('served', $order->fresh()->status);
        $this->getJson("/api/v1/public/sessions/{$guest}")->assertJsonPath('orders.0.status', 'served');

        // 6. round 2 on the same session/check
        $round2 = $this->guestOrder(8, [['product_id' => $this->product('Crimson Negroni')->id, 'quantity' => 1]])->assertCreated();
        $this->assertSame($guest, $round2->json('guest_token'));
        $this->assertSame(5170 + 1200, $check->fresh()->total_cents);

        // 7. bill request
        $this->postJson("/api/v1/public/sessions/{$guest}/requests", ['type' => 'bill'], ['Idempotency-Key' => 'bill-1'])->assertCreated();
        $this->assertSame('bill_requested', $session->fresh()->status);

        $this->actingAsEmail('cashier@noar.local');
        $tables = collect($this->getJson($this->b('/tables-live'))->json('tables'));
        $this->assertSame('bill', $tables->firstWhere('number', 8)['status']);
        $detail = $this->getJson($this->b('/sessions/'.$session->id))->assertOk();
        $this->assertSame(6370, $detail->json('checks.0.due_cents'));

        // cannot clear an unpaid table
        $this->postJson($this->b("/sessions/{$session->id}/clear"))->assertStatus(409);

        // 8. split payment: items + remainder by cash
        $colaLine = collect($detail->json('checks.0.items'))->firstWhere('name', 'Кока-Кола 330 мл (Класик)');
        $this->postJson($this->b("/checks/{$check->id}/payments"), ['method' => 'card', 'mode' => 'items', 'check_item_ids' => [$colaLine['id']]], ['Idempotency-Key' => 'pay-1'])
            ->assertCreated()->assertJsonPath('check.paid_cents', 700);
        // retry with the same key does not double-charge
        $this->postJson($this->b("/checks/{$check->id}/payments"), ['method' => 'card', 'mode' => 'items', 'check_item_ids' => [$colaLine['id']]], ['Idempotency-Key' => 'pay-1'])
            ->assertCreated()->assertHeader('Idempotent-Replay', 'true');
        $this->assertSame(700, $check->fresh()->paid_cents);

        $this->postJson($this->b("/checks/{$check->id}/payments"), ['method' => 'cash', 'mode' => 'full', 'tendered_cents' => 6000], ['Idempotency-Key' => 'pay-2'])
            ->assertCreated()->assertJsonPath('payment.change_cents', 6000 - 5670)->assertJsonPath('check.status', 'settled');

        // round-2 negroni is not yet served → table cannot be cleared yet
        $this->postJson($this->b("/sessions/{$session->id}/clear"))->assertStatus(409);
        $this->actingAsEmail('bar@noar.local');
        $negroni = PrepItem::whereHas('orderItem', fn ($q) => $q->where('name', 'Crimson Negroni')->whereHas('order', fn ($o) => $o->where('table_session_id', $session->id)))->first();
        $this->patchJson($this->b('/prep-items/'.$negroni->id), ['status' => 'ready'])->assertOk();
        $this->postJson($this->b('/orders/'.$negroni->orderItem->order_id.'/serve'))->assertOk();

        $this->actingAsEmail('waiter@noar.local');
        $this->postJson($this->b("/sessions/{$session->id}/clear"))->assertOk();
        $this->assertSame('closed', $session->fresh()->status);
        $this->assertSame('completed', $order->fresh()->status);
        $tables = collect($this->getJson($this->b('/tables-live'))->json('tables'));
        $this->assertSame('available', $tables->firstWhere('number', 8)['status']);

        // 9. reports reflect the real payments exactly once
        $this->actingAsEmail('manager@noar.local');
        $this->getJson($this->b('/reports/summary'))->assertOk()->assertJsonPath('kpi.sales_cents', 6370);
    }

    public function test_manual_accept_mode_requires_staff_and_check_is_filled_on_accept(): void
    {
        $this->actingAsEmail('manager@noar.local');
        $this->patchJson($this->b('/settings'), ['order_accept_mode' => 'manual'])->assertOk();

        $res = $this->guestOrder(3, $this->scenarioItems())->assertCreated()->assertJsonPath('order.status', 'pending');
        $order = Order::where('public_id', $res->json('order.public_id'))->first();
        $this->assertSame(0, Check::where('table_session_id', $order->table_session_id)->count());
        $this->assertSame(0, PrepItem::count());

        $this->actingAsEmail('waiter@noar.local');
        $this->postJson($this->b("/orders/{$order->id}/accept"))->assertOk()->assertJsonPath('order.status', 'accepted');
        $this->assertSame(5170, Check::where('table_session_id', $order->table_session_id)->value('total_cents'));
        $this->postJson($this->b("/orders/{$order->id}/accept"))->assertOk(); // idempotent
        $this->assertSame(3, PrepItem::count()); // one prep item per order item
    }

    public function test_qr_order_is_idempotent_and_server_prices_are_authoritative(): void
    {
        $items = [['product_id' => $this->product('Маргарита Наполетана')->id, 'quantity' => 1, 'modifier_ids' => [$this->option('Маргарита Наполетана', '40 см')], 'price_cents' => 1]];
        $a = $this->guestOrder(5, $items, null, 'same-key')->assertCreated();
        $b = $this->guestOrder(5, $items, null, 'same-key')->assertCreated();
        $this->assertSame($a->json('order.public_id'), $b->json('order.public_id'));
        $this->assertSame(1, Order::count());
        $this->assertSame(1190 + 450, $a->json('order.total_cents'));

        // reused key with a different body is rejected
        $this->guestOrder(5, [['product_id' => $this->product('Диавола')->id, 'quantity' => 1, 'modifier_ids' => [$this->option('Диавола', '32 см')]]], null, 'same-key')->assertStatus(422);
    }

    public function test_validation_of_modifiers_availability_and_qr_token(): void
    {
        $burger = $this->product('NOAR Смаш бургер');
        // required variant missing
        $this->guestOrder(2, [['product_id' => $burger->id, 'quantity' => 1]])->assertStatus(422)->assertJsonPath('error.code', 'modifier_required');
        // option from another product
        $this->guestOrder(2, [['product_id' => $burger->id, 'quantity' => 1, 'modifier_ids' => [$this->option('Диавола', '40 см')]]])->assertStatus(422);
        // unavailable product
        $burger->update(['is_available' => false]);
        $this->guestOrder(2, [['product_id' => $burger->id, 'quantity' => 1, 'modifier_ids' => [$this->option('NOAR Смаш бургер', 'Средно')]]])->assertJsonPath('error.code', 'product_unavailable');
        // bogus QR token
        $this->postJson('/api/v1/public/tables/not-a-token/orders', ['items' => []], ['Idempotency-Key' => 'x'])->assertNotFound();
        // missing idempotency key
        $this->postJson("/api/v1/public/tables/{$this->token(2)}/orders", ['items' => [['product_id' => 1, 'quantity' => 1]]])->assertStatus(400);
    }

    public function test_cancel_item_releases_reserved_stock_and_voids_check_line(): void
    {
        $res = $this->guestOrder(4, $this->scenarioItems())->assertCreated();
        $order = Order::where('public_id', $res->json('order.public_id'))->first();
        $beef = Ingredient::where('name', 'Телешка кайма')->first();
        $this->assertEqualsWithDelta(360, (float) $beef->fresh()->reserved, 0.001);

        $this->actingAsEmail('waiter@noar.local');
        $burger = $order->items()->where('name', 'NOAR Смаш бургер')->first();
        $this->postJson($this->b("/order-items/{$burger->id}/cancel"), ['reason' => 'грешка'])->assertForbidden(); // waiter lacks orders.cancel

        $this->actingAsEmail('manager@noar.local');
        $this->postJson($this->b("/order-items/{$burger->id}/cancel"), ['reason' => 'грешка'])->assertOk();
        $this->assertEqualsWithDelta(0, (float) $beef->fresh()->reserved, 0.001);
        $this->assertSame(5170 - 3180, Check::where('table_session_id', $order->table_session_id)->value('total_cents'));
        $this->assertSame(3, StockMovement::where('order_item_id', $burger->id)->where('type', 'release')->count()); // 3 recipe ingredients
        $this->postJson($this->b("/order-items/{$burger->id}/cancel"), ['reason' => 'повторно'])->assertStatus(409);
        $this->assertSame(3, StockMovement::where('order_item_id', $burger->id)->where('type', 'release')->count());
    }

    public function test_discount_requires_permission_and_split_merge_safeguards(): void
    {
        $res = $this->guestOrder(6, $this->scenarioItems())->assertCreated();
        $order = Order::where('public_id', $res->json('order.public_id'))->first();
        $check = Check::where('table_session_id', $order->table_session_id)->first();

        $this->actingAsEmail('waiter@noar.local');
        $this->postJson($this->b("/checks/{$check->id}/discount"), ['type' => 'percent', 'value' => 10, 'reason' => 'VIP'])->assertForbidden();

        $this->actingAsEmail('manager@noar.local');
        $this->postJson($this->b("/checks/{$check->id}/discount"), ['type' => 'percent', 'value' => 10, 'reason' => 'VIP'])
            ->assertOk()->assertJsonPath('check.discount_cents', 517)->assertJsonPath('check.total_cents', 5170 - 517);
        // split refused when a discount is applied
        $items = collect($this->getJson($this->b("/checks/{$check->id}"))->json('check.items'));
        $this->postJson($this->b("/checks/{$check->id}/split"), ['check_item_ids' => [$items[0]['id']]])->assertStatus(422);
        $this->postJson($this->b("/checks/{$check->id}/discount"), ['type' => 'amount', 'value' => 0, 'reason' => 'отмяна'])->assertOk();

        $split = $this->postJson($this->b("/checks/{$check->id}/split"), ['check_item_ids' => [$items[0]['id']]])->assertCreated();
        $newId = $split->json('new_check.id');
        $this->assertSame(3180, $split->json('new_check.total_cents'));
        $this->assertSame(1990, $split->json('check.total_cents'));

        $this->postJson($this->b("/checks/{$newId}/payments"), ['method' => 'card', 'mode' => 'amount', 'amount_cents' => 1000], ['Idempotency-Key' => 'p1'])->assertCreated();
        // cannot merge a check that already has payments
        $this->postJson($this->b("/checks/{$check->id}/merge"), ['source_check_id' => $newId])->assertStatus(422);
        // overpay rejected
        $this->postJson($this->b("/checks/{$newId}/payments"), ['method' => 'card', 'mode' => 'amount', 'amount_cents' => 999999], ['Idempotency-Key' => 'p2'])->assertStatus(422);
    }
}
