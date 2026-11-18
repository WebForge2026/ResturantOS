<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Check;
use App\Models\Order;

class TenantIsolationTest extends NoarTestCase
{
    public function test_other_organization_cannot_access_noar_resources(): void
    {
        $res = $this->guestOrder(8, $this->scenarioItems())->assertCreated();
        $order = Order::where('public_id', $res->json('order.public_id'))->first();
        $check = Check::where('table_session_id', $order->table_session_id)->first();

        $this->actingAsEmail('owner@bistro.local');
        foreach (['/', '/tables-live', '/menu', '/orders', '/staff', '/reports/summary', '/ingredients', '/audit', '/sessions/'.$order->table_session_id, '/checks/'.$check->id] as $path) {
            $this->getJson($this->b($path))->assertNotFound();
        }
        $this->postJson($this->b("/checks/{$check->id}/payments"), ['method' => 'cash', 'mode' => 'full'], ['Idempotency-Key' => 'evil'])->assertNotFound();
        $this->postJson($this->b("/orders/{$order->id}/serve"))->assertNotFound();

        // even through its OWN branch prefix, NOAR's nested ids are not reachable
        $bistro = Branch::where('slug', 'bistro-plovdiv')->first();
        $this->getJson("/api/v1/branches/{$bistro->id}/checks/{$check->id}")->assertNotFound();
        $this->getJson("/api/v1/branches/{$bistro->id}/sessions/{$order->table_session_id}")->assertNotFound();
        $this->postJson("/api/v1/branches/{$bistro->id}/orders/{$order->id}/accept")->assertNotFound();
        $this->getJson("/api/v1/branches/{$bistro->id}/tables-live")->assertOk()->assertJsonCount(1, 'tables');
    }

    public function test_role_permissions_are_enforced_server_side(): void
    {
        $this->actingAsEmail('kitchen@noar.local');
        $this->getJson($this->b('/reports/summary'))->assertForbidden();
        $this->getJson($this->b('/staff'))->assertForbidden();
        $this->putJson($this->b('/floor'), ['areas' => [], 'tables' => []])->assertForbidden();

        $this->actingAsEmail('waiter@noar.local');
        $this->getJson($this->b('/ingredients'))->assertForbidden();
        $this->patchJson($this->b('/settings'), ['order_accept_mode' => 'manual'])->assertForbidden();

        $this->actingAsEmail('stock@noar.local');
        $this->getJson($this->b('/ingredients'))->assertOk();
        $this->getJson($this->b('/tables-live'))->assertForbidden();

        $this->actingAsEmail('owner@noar.local');
        $this->getJson('/api/v1/platform/organizations')->assertForbidden();
        $this->actingAsEmail('admin@platform.local');
        $this->getJson('/api/v1/platform/organizations')->assertOk();
        $this->getJson($this->b('/tables-live'))->assertNotFound(); // platform admin has no tenant membership
    }

    public function test_guest_tokens_do_not_expose_other_sessions(): void
    {
        $this->guestOrder(1, $this->scenarioItems())->assertCreated();
        $this->getJson('/api/v1/public/sessions/guess-me')->assertNotFound();
        $this->getJson('/api/v1/public/tables/'.$this->token(1))->assertOk()->assertJsonMissingPath('session');
    }

    public function test_login_register_and_suspension(): void
    {
        $this->postJson('/api/v1/auth/login', ['email' => 'owner@noar.local', 'password' => 'wrong'])->assertStatus(401);
        $ok = $this->postJson('/api/v1/auth/login', ['email' => 'owner@noar.local', 'password' => config('noar.demo_password') ?: 'noar-demo-2026'])->assertOk();
        $this->assertNotEmpty($ok->json('token'));
        $this->assertContains('payments.take', $ok->json('user.branches.0.permissions'));

        $reg = $this->postJson('/api/v1/auth/register', [
            'name' => 'Нов Собственик', 'email' => 'new@owner.local', 'password' => 'super-secret-1',
            'organization_name' => 'Ново Кафе', 'branch_name' => 'Ново Кафе Варна',
        ])->assertCreated();
        $this->assertFalse($reg->json('user.branches.0.onboarding_completed'));

        $this->actingAsEmail('admin@platform.local');
        $org = $this->noar()->organization_id;
        $this->patchJson("/api/v1/platform/organizations/{$org}", ['status' => 'suspended'])->assertOk();
        $this->actingAsEmail('waiter@noar.local');
        $this->getJson($this->b('/tables-live'))->assertForbidden();
        $this->guestOrder(2, $this->scenarioItems())->assertNotFound();
    }
}
