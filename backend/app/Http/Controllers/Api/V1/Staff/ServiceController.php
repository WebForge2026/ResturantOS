<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Domain\Orders\OrderService;
use App\Domain\Realtime\Realtime;
use App\Http\Controllers\Controller;
use App\Models\Check;
use App\Models\DiningTable;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PrepItem;
use App\Models\PrepTicket;
use App\Models\ServiceRequest;
use App\Models\TableSession;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Idempotency;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** POS, waiter and KDS operations. */
class ServiceController extends Controller
{
    public function __construct(private OrderService $orders) {}

    // ---------------------------------------------------------------- tables & sessions

    public function tables(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $tables = $branch->tables()->where('is_active', true)->orderBy('number')->get();
        $sessions = TableSession::where('branch_id', $branch->id)->whereIn('status', TableSession::ACTIVE_STATUSES)
            ->with(['orders:id,table_session_id,status', 'checks', 'serviceRequests', 'waiter:id,name'])->get()->keyBy('dining_table_id');
        return response()->json([
            'areas' => $branch->areas()->get(['id', 'name', 'kind']),
            'tables' => $tables->map(fn ($t) => Present::tableLive($t, $sessions->get($t->id)))->values(),
        ]);
    }

    public function openSession(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate(['table_id' => ['required', 'integer'], 'guests' => ['nullable', 'integer', 'min:1', 'max:40']]);
        $table = $this->own(DiningTable::find($data['table_id']), $branch);
        $session = $this->orders->openSession($table, $request->user());
        if (isset($data['guests'])) {
            $session->update(['guests' => $data['guests']]);
        }
        return response()->json(['session_id' => $session->id], 201);
    }

    public function session(Request $request, int $sessionId): JsonResponse
    {
        $branch = $this->branch($request);
        $session = $this->own(TableSession::with('table', 'waiter')->find($sessionId), $branch);
        $orders = Order::where('table_session_id', $session->id)->with('items.prepItem', 'table')->orderBy('id')->get();
        return response()->json([
            'session' => [
                'id' => $session->id,
                'status' => $session->status,
                'table' => ['id' => $session->table->id, 'label' => $session->table->label, 'number' => $session->table->number],
                'waiter' => $session->waiter?->only(['id', 'name']),
                'guests' => $session->guests,
                'opened_at' => $session->opened_at->toIso8601String(),
                'bill_requested_at' => $session->bill_requested_at?->toIso8601String(),
            ],
            'orders' => $orders->map(fn ($o) => Present::staffOrder($o))->values(),
            'checks' => Check::where('table_session_id', $session->id)->where('status', '!=', 'void')->orderBy('seq')->get()->map(fn ($c) => Present::check($c))->values(),
            'requests' => $session->serviceRequests()->where('status', '!=', 'done')->get(['id', 'type', 'status', 'created_at']),
        ]);
    }

    public function staffOrder(Request $request, int $sessionId): JsonResponse
    {
        $branch = $this->branch($request);
        $session = $this->own(TableSession::find($sessionId), $branch);
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:60'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'items.*.modifier_ids' => ['array'],
            'items.*.modifier_ids.*' => ['integer'],
            'items.*.note' => ['nullable', 'string', 'max:200'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        return Idempotency::handle($request, 'staff-order:'.$session->id, function () use ($session, $data, $request) {
            $order = $this->orders->placeStaffOrder($session, $data['items'], $data['note'] ?? null, $request->user());
            return [201, ['order' => Present::staffOrder($order->load('items'))]];
        });
    }

    public function transfer(Request $request, int $sessionId): JsonResponse
    {
        $branch = $this->branch($request);
        $session = $this->own(TableSession::find($sessionId), $branch);
        $data = $request->validate(['table_id' => ['required', 'integer']]);
        $target = $this->own(DiningTable::find($data['table_id']), $branch);
        $this->orders->transfer($session, $target, $request->user());
        return response()->json(['ok' => true]);
    }

    public function clear(Request $request, int $sessionId): JsonResponse
    {
        $branch = $this->branch($request);
        $session = $this->own(TableSession::find($sessionId), $branch);
        $this->orders->clearTable($session, $request->user());
        return response()->json(['ok' => true]);
    }

    public function assignWaiter(Request $request, int $sessionId): JsonResponse
    {
        $branch = $this->branch($request);
        $session = $this->own(TableSession::find($sessionId), $branch);
        $data = $request->validate(['waiter_id' => ['nullable', 'integer']]);
        if ($data['waiter_id']) {
            $ok = \App\Models\Membership::where('user_id', $data['waiter_id'])->where('organization_id', $branch->organization_id)->exists();
            if (! $ok) {
                throw new DomainError('invalid_waiter', 'Служителят не е от този обект.');
            }
        }
        $session->update(['waiter_id' => $data['waiter_id']]);
        Realtime::emit($branch->id, 'table.updated', ['table_id' => $session->dining_table_id]);
        return response()->json(['ok' => true]);
    }

    public function requestBill(Request $request, int $sessionId): JsonResponse
    {
        $branch = $this->branch($request);
        $session = $this->own(TableSession::find($sessionId), $branch);
        if ($session->status === 'open') {
            $session->update(['status' => 'bill_requested', 'bill_requested_at' => now()]);
        }
        Realtime::emit($branch->id, 'table.updated', ['table_id' => $session->dining_table_id]);
        return response()->json(['ok' => true]);
    }

    // ---------------------------------------------------------------- orders

    public function orders(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'status' => ['nullable', 'string'],
            'date' => ['nullable', 'date'],
            'active' => ['nullable', 'boolean'],
        ]);
        $q = Order::where('branch_id', $branch->id)->with('items', 'table')->latest('id');
        if (! empty($data['status'])) $q->whereIn('status', explode(',', $data['status']));
        if (! empty($data['date'])) $q->whereDate('business_date', $data['date']);
        if (! empty($data['active'])) $q->whereNotIn('status', ['completed', 'cancelled']);
        return response()->json(['data' => $q->limit(200)->get()->map(fn ($o) => Present::staffOrder($o))]);
    }

    public function accept(Request $request, int $orderId): JsonResponse
    {
        $branch = $this->branch($request);
        $order = $this->own(Order::find($orderId), $branch);
        $this->orders->accept($order, $request->user());
        return response()->json(['order' => Present::staffOrder($order->fresh()->load('items'))]);
    }

    public function cancelOrder(Request $request, int $orderId): JsonResponse
    {
        $branch = $this->branch($request);
        $order = $this->own(Order::find($orderId), $branch);
        $data = $request->validate(['reason' => ['required', 'string', 'max:200']]);
        $this->orders->cancelOrder($order, $request->user(), $data['reason']);
        return response()->json(['order' => Present::staffOrder($order->fresh()->load('items'))]);
    }

    public function cancelItem(Request $request, int $itemId): JsonResponse
    {
        $branch = $this->branch($request);
        $item = OrderItem::with('order')->find($itemId);
        $this->own($item?->order, $branch);
        $data = $request->validate(['reason' => ['required', 'string', 'max:200']]);
        $this->orders->cancelItem($item, $request->user(), $data['reason']);
        return response()->json(['ok' => true]);
    }

    public function serve(Request $request, int $orderId): JsonResponse
    {
        $branch = $this->branch($request);
        $order = $this->own(Order::find($orderId), $branch);
        $data = $request->validate(['item_ids' => ['nullable', 'array'], 'item_ids.*' => ['integer']]);
        $this->orders->serve($order, $data['item_ids'] ?? null, $request->user());
        return response()->json(['order' => Present::staffOrder($order->fresh()->load('items'))]);
    }

    // ---------------------------------------------------------------- waiter feed

    public function waiterFeed(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $ready = OrderItem::whereHas('order', fn ($q) => $q->where('branch_id', $branch->id))
            ->where('status', 'ready')->with('order.table', 'station')->get()
            ->groupBy('order_id')->map(fn ($items) => [
                'order_id' => $items->first()->order_id,
                'order_number' => $items->first()->order->number,
                'table_id' => $items->first()->order->dining_table_id,
                'table_label' => $items->first()->order->table->label,
                'items' => $items->map(fn ($i) => [
                    'id' => $i->id, 'name' => $i->name, 'quantity' => $i->quantity, 'station' => $i->station?->name,
                    'modifiers' => collect($i->modifiers ?? [])->pluck('name'),
                    'ready_at' => $i->prepItem?->ready_at?->toIso8601String(),
                ])->values(),
            ])->values();
        $pending = Order::where('branch_id', $branch->id)->where('status', 'pending')->with('items', 'table')->get()
            ->map(fn ($o) => Present::staffOrder($o));
        $requests = ServiceRequest::where('branch_id', $branch->id)->where('status', '!=', 'done')->with('table')->latest()->get()
            ->map(fn ($r) => ['id' => $r->id, 'type' => $r->type, 'status' => $r->status, 'table_id' => $r->dining_table_id, 'table_label' => $r->table->label, 'session_id' => $r->table_session_id, 'created_at' => $r->created_at->toIso8601String()]);
        return response()->json(['ready' => $ready, 'pending' => $pending, 'requests' => $requests]);
    }

    public function updateRequest(Request $request, int $requestId): JsonResponse
    {
        $branch = $this->branch($request);
        $req = $this->own(ServiceRequest::find($requestId), $branch);
        $data = $request->validate(['status' => ['required', Rule::in(['acknowledged', 'done'])]]);
        $req->update([
            'status' => $data['status'],
            'handled_by' => $request->user()->id,
            $data['status'] === 'done' ? 'done_at' : 'acknowledged_at' => now(),
        ]);
        Realtime::emit($branch->id, 'request.updated', ['id' => $req->id, 'table_id' => $req->dining_table_id]);
        return response()->json(['ok' => true]);
    }

    // ---------------------------------------------------------------- KDS / bar

    public function kds(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'display' => ['required', Rule::in(['kitchen', 'bar'])],
            'station_id' => ['nullable', 'integer'],
            'include_done' => ['nullable', 'boolean'],
        ]);
        $this->requirePermission($request, $data['display'] === 'bar' ? 'kds.bar' : 'kds.kitchen');
        $stations = $branch->stations()->where('display', $data['display'])->get();
        $stationIds = $stations->pluck('id');
        if (! empty($data['station_id'])) {
            $stationIds = $stationIds->intersect([(int) $data['station_id']]);
        }
        $statuses = ! empty($data['include_done']) ? ['queued', 'preparing', 'ready', 'handed_off'] : ['queued', 'preparing', 'ready'];
        $tickets = PrepTicket::where('branch_id', $branch->id)->whereIn('station_id', $stationIds)->whereIn('status', $statuses)
            ->when(! empty($data['include_done']), fn ($q) => $q->where('updated_at', '>=', now()->subHours(2)))
            ->with(['items.orderItem', 'order.table', 'station'])->orderBy('created_at')->get();

        return response()->json([
            'stations' => $stations->map->only(['id', 'name', 'code', 'color']),
            'tickets' => $tickets->map(fn (PrepTicket $t) => [
                'id' => $t->id,
                'status' => $t->status,
                'station' => $t->station->only(['id', 'name', 'code', 'color']),
                'order_id' => $t->order_id,
                'order_number' => $t->order->number,
                'order_note' => $t->order->note,
                'source' => $t->order->source,
                'table_label' => $t->order->table->label,
                'created_at' => $t->created_at->toIso8601String(),
                'started_at' => $t->started_at?->toIso8601String(),
                'items' => $t->items->map(fn (PrepItem $p) => [
                    'id' => $p->id,
                    'status' => $p->status,
                    'name' => $p->orderItem->name,
                    'quantity' => $p->orderItem->quantity,
                    'modifiers' => collect($p->orderItem->modifiers ?? [])->pluck('name'),
                    'note' => $p->orderItem->note,
                ])->values(),
            ])->values(),
        ]);
    }

    public function setPrepItem(Request $request, int $prepItemId): JsonResponse
    {
        $branch = $this->branch($request);
        $prep = PrepItem::with('ticket.station')->find($prepItemId);
        $this->own($prep?->ticket, $branch);
        $this->requirePermission($request, $prep->ticket->station->display === 'bar' ? 'kds.bar' : 'kds.kitchen');
        $data = $request->validate(['status' => ['required', Rule::in(['queued', 'preparing', 'ready'])]]);
        $this->orders->setPrepStatus($prep, $data['status'], $request->user());
        return response()->json(['ok' => true, 'status' => $data['status']]);
    }

    public function setTicket(Request $request, int $ticketId): JsonResponse
    {
        $branch = $this->branch($request);
        $ticket = $this->own(PrepTicket::with('station', 'items')->find($ticketId), $branch);
        $this->requirePermission($request, $ticket->station->display === 'bar' ? 'kds.bar' : 'kds.kitchen');
        $data = $request->validate(['status' => ['required', Rule::in(['preparing', 'ready'])]]);
        foreach ($ticket->items as $prep) {
            if (in_array($prep->status, ['cancelled', 'handed_off', $data['status']], true)) {
                continue;
            }
            if ($data['status'] === 'preparing' && $prep->status !== 'queued') {
                continue;
            }
            $this->orders->setPrepStatus($prep, $data['status'], $request->user());
        }
        Audit::record($branch, 'ticket.'.$data['status'], $ticket, [], $request->user()->id);
        return response()->json(['ok' => true]);
    }
}
