<?php

namespace App\Http\Controllers\Api\V1\Public;

use App\Domain\Orders\OrderService;
use App\Domain\Realtime\Realtime;
use App\Http\Controllers\Controller;
use App\Models\Check;
use App\Models\DiningTable;
use App\Models\ServiceRequest;
use App\Models\TableSession;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Idempotency;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Anonymous guest API. Authorization = possession of a random table QR token
 * (and, for status/requests, the random session guest token returned on first order).
 */
class PublicMenuController extends Controller
{
    public function __construct(private OrderService $orders) {}

    /** LOCAL DEMO ONLY: map table numbers → QR tokens so ?table=7 works. */
    public function demoTables(): JsonResponse
    {
        if (! app()->environment('local', 'testing', 'demo') || ! config('noar.demo_table_lookup')) {
            abort(404);
        }
        $tables = DiningTable::whereHas('branch', fn ($q) => $q->where('slug', config('noar.demo_branch_slug')))
            ->where('is_active', true)->orderBy('number')->get(['number', 'label', 'qr_token']);
        return response()->json(['data' => $tables->map(fn ($t) => ['number' => $t->number, 'label' => $t->label, 'qr_token' => $t->qr_token])]);
    }

    public function table(string $token): JsonResponse
    {
        $table = $this->tableByToken($token);
        $branch = $table->branch;
        $categories = $branch->categories()->where('is_active', true)
            ->with(['products' => fn ($q) => $q->where('is_published', true)->with('modifierGroups.options')])->get();

        return response()->json([
            'restaurant' => [
                'name' => $branch->brand_name ?: $branch->name,
                'currency' => 'EUR',
                'show_bgn' => (bool) $branch->setting('show_bgn'),
                'bgn_rate' => 1.95583,
                'accept_mode' => $branch->setting('order_accept_mode'),
            ],
            'table' => ['number' => $table->number, 'label' => $table->label, 'area' => $table->area?->name],
            'menu' => [
                'categories' => $categories->map(fn ($c) => [
                    'id' => $c->id, 'name' => $c->name, 'slug' => $c->slug,
                    'products' => $c->products->map(fn ($p) => Present::publicProduct($p))->values(),
                ])->values(),
            ],
        ]);
    }

    public function placeOrder(Request $request, string $token): JsonResponse
    {
        $table = $this->tableByToken($token);
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:40'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'items.*.modifier_ids' => ['array', 'max:20'],
            'items.*.modifier_ids.*' => ['integer'],
            'items.*.note' => ['nullable', 'string', 'max:200'],
            'note' => ['nullable', 'string', 'max:500'],
            'guest_token' => ['nullable', 'string', 'max:64'],
        ]);

        return Idempotency::handle($request, 'qr-order:'.$table->id, function () use ($table, $data) {
            $order = $this->orders->placeQrOrder($table, $data['items'], $data['note'] ?? null);
            $session = TableSession::find($order->table_session_id);
            return [201, ['order' => Present::publicOrder($order->load('items')), 'guest_token' => $session->guest_token]];
        }, required: true);
    }

    public function session(string $guestToken): JsonResponse
    {
        $session = $this->sessionByToken($guestToken, allowClosed: true);
        $orders = OrderService::sessionOrders($session);
        $checks = Check::where('table_session_id', $session->id)->where('status', '!=', 'void')->get();

        return response()->json([
            'guest_token' => $guestToken,
            'status' => $session->status,
            'table' => ['number' => $session->table->number, 'label' => $session->table->label],
            'orders' => $orders->map(fn ($o) => Present::publicOrder($o))->values(),
            'check' => $checks->isEmpty() ? null : [
                'total_cents' => (int) $checks->sum('total_cents'),
                'paid_cents' => (int) $checks->sum('paid_cents'),
                'due_cents' => (int) $checks->sum(fn ($c) => $c->dueCents()),
            ],
            'open_requests' => $session->serviceRequests()->where('status', '!=', 'done')->get(['type', 'status']),
        ]);
    }

    public function serviceRequest(Request $request, string $guestToken): JsonResponse
    {
        $data = $request->validate(['type' => ['required', 'in:bill,waiter']]);
        $session = $this->sessionByToken($guestToken);

        return Idempotency::handle($request, 'guest-request:'.$session->id, function () use ($session, $data) {
            DB::transaction(function () use ($session, $data) {
                $session = TableSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
                $exists = ServiceRequest::where('table_session_id', $session->id)->where('type', $data['type'])->where('status', '!=', 'done')->exists();
                if (! $exists) {
                    $req = ServiceRequest::create([
                        'branch_id' => $session->branch_id,
                        'table_session_id' => $session->id,
                        'dining_table_id' => $session->dining_table_id,
                        'type' => $data['type'],
                        'status' => 'open',
                    ]);
                    Audit::record($session->branch, 'request.created', $req, ['type' => $data['type']], null, 'guest');
                }
                if ($data['type'] === 'bill' && $session->status === 'open') {
                    $session->update(['status' => 'bill_requested', 'bill_requested_at' => now()]);
                }
                Realtime::emit($session->branch_id, 'request.created', ['type' => $data['type'], 'table_id' => $session->dining_table_id]);
                Realtime::emit($session->branch_id, 'table.updated', ['table_id' => $session->dining_table_id]);
            });
            return [201, ['ok' => true]];
        });
    }

    private function tableByToken(string $token): DiningTable
    {
        $table = DiningTable::where('qr_token', $token)->with('branch.organization')->first();
        if (! $table || ! $table->is_active || $table->branch->organization->status !== 'active') {
            throw new DomainError('invalid_qr', 'Невалиден или изтекъл QR код. Моля, помолете персонала за помощ.', 404);
        }
        return $table;
    }

    private function sessionByToken(string $guestToken, bool $allowClosed = false): TableSession
    {
        $session = TableSession::where('guest_token', $guestToken)->with('table')->first();
        if (! $session) {
            throw new DomainError('session_not_found', 'Сесията на масата не е намерена.', 404);
        }
        if (! $allowClosed && ! $session->acceptsOrders()) {
            throw new DomainError('session_closed', 'Сметката на масата вече е приключена.', 409);
        }
        return $session;
    }
}
