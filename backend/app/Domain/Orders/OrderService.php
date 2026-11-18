<?php

namespace App\Domain\Orders;

use App\Domain\Billing\CheckService;
use App\Domain\Inventory\StockService;
use App\Domain\Realtime\Realtime;
use App\Models\Branch;
use App\Models\Check;
use App\Models\CheckItem;
use App\Models\DiningTable;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PrepItem;
use App\Models\PrepTicket;
use App\Models\Product;
use App\Models\Station;
use App\Models\TableSession;
use App\Models\User;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Tokens;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The order state machine. See docs/ORDER_STATES.md.
 */
class OrderService
{
    public const PREP_TRANSITIONS = [
        'queued' => ['preparing', 'ready'],
        'preparing' => ['queued', 'ready'],
        'ready' => ['preparing'],
        'handed_off' => [],
        'cancelled' => [],
    ];

    public function __construct(private CheckService $checks, private StockService $stock) {}

    // ---------------------------------------------------------------- sessions

    public function openSession(DiningTable $table, ?User $waiter = null): TableSession
    {
        return DB::transaction(function () use ($table, $waiter) {
            $table = DiningTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            $session = $this->activeSession($table);
            if ($session) {
                return $session;
            }
            $session = TableSession::create([
                'branch_id' => $table->branch_id,
                'dining_table_id' => $table->id,
                'waiter_id' => $waiter?->id,
                'status' => 'open',
                'guest_token' => Tokens::random(24),
                'opened_at' => now(),
            ]);
            Realtime::emit($table->branch_id, 'table.updated', ['table_id' => $table->id]);
            return $session;
        });
    }

    public function activeSession(DiningTable $table): ?TableSession
    {
        return TableSession::where('dining_table_id', $table->id)
            ->whereIn('status', TableSession::ACTIVE_STATUSES)->latest('id')->first();
    }

    // ---------------------------------------------------------------- placing

    /**
     * Validate requested lines against the live menu and compute authoritative prices.
     *
     * @return array<int, array{product: Product, quantity: int, unit: int, modifiers: array, note: ?string}>
     */
    public function priceLines(Branch $branch, array $items): array
    {
        if (count($items) === 0) {
            throw new DomainError('empty_order', 'Поръчката е празна.');
        }
        $products = Product::where('branch_id', $branch->id)
            ->whereIn('id', collect($items)->pluck('product_id')->unique())
            ->with('modifierGroups.options')->get()->keyBy('id');

        $lines = [];
        foreach ($items as $raw) {
            $product = $products->get((int) $raw['product_id']);
            if (! $product || ! $product->is_published) {
                throw new DomainError('product_not_found', 'Артикулът не е намерен в менюто.');
            }
            if (! $product->is_available) {
                throw new DomainError('product_unavailable', "„{$product->name}“ в момента не е наличен.");
            }
            $qty = (int) $raw['quantity'];
            if ($qty < 1 || $qty > 50) {
                throw new DomainError('invalid_quantity', 'Невалидно количество.');
            }
            $selected = collect($raw['modifier_ids'] ?? [])->map(fn ($id) => (int) $id)->unique();
            $unit = $product->price_cents;
            $mods = [];
            $knownOptionIds = collect();
            foreach ($product->modifierGroups as $group) {
                $chosen = $group->options->whereIn('id', $selected->all());
                $knownOptionIds = $knownOptionIds->merge($group->options->pluck('id'));
                if ($chosen->count() < $group->min_select) {
                    throw new DomainError('modifier_required', "Изберете „{$group->name}“ за {$product->name}.");
                }
                if ($chosen->count() > $group->max_select) {
                    throw new DomainError('modifier_too_many', "Твърде много избори в „{$group->name}“.");
                }
                foreach ($chosen as $opt) {
                    if (! $opt->is_available) {
                        throw new DomainError('modifier_unavailable', "„{$opt->name}“ не е наличен.");
                    }
                    $unit += $opt->price_delta_cents;
                    $mods[] = ['id' => $opt->id, 'group' => $group->name, 'name' => $opt->name, 'price_delta_cents' => $opt->price_delta_cents];
                }
            }
            if ($selected->diff($knownOptionIds)->isNotEmpty()) {
                throw new DomainError('modifier_invalid', 'Невалидна добавка за този артикул.');
            }
            $lines[] = [
                'product' => $product,
                'quantity' => $qty,
                'unit' => max(0, $unit),
                'modifiers' => $mods,
                'note' => isset($raw['note']) ? Str::limit(trim((string) $raw['note']), 200, '') ?: null : null,
            ];
        }
        return $lines;
    }

    public function placeQrOrder(DiningTable $table, array $items, ?string $note): Order
    {
        return DB::transaction(function () use ($table, $items, $note) {
            $table = DiningTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            if (! $table->is_active) {
                throw new DomainError('table_inactive', 'Тази маса не приема поръчки в момента.');
            }
            $branch = $table->branch;
            $session = $this->activeSession($table);
            if ($session && ! $session->acceptsOrders()) {
                throw new DomainError('session_closing', 'Сметката на масата е платена. Моля, изчакайте персонала.', 409);
            }
            $session ??= $this->openSession($table);

            $order = $this->createOrder($session, $this->priceLines($branch, $items), 'qr', $note, null);
            Audit::record($branch, 'order.placed', $order, ['source' => 'qr', 'table' => $table->number], null, 'guest');

            if ($branch->setting('order_accept_mode') === 'auto') {
                $this->accept($order, null);
            }
            return $order->fresh(['items']);
        });
    }

    public function placeStaffOrder(TableSession $session, array $items, ?string $note, User $user): Order
    {
        return DB::transaction(function () use ($session, $items, $note, $user) {
            $session = TableSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            if (! $session->acceptsOrders()) {
                throw new DomainError('session_closed', 'Масата не приема нови поръчки.', 409);
            }
            $order = $this->createOrder($session, $this->priceLines($session->branch, $items), 'staff', $note, $user);
            Audit::record($session->branch, 'order.placed', $order, ['source' => 'staff'], $user->id);
            $this->accept($order, $user);
            return $order->fresh(['items']);
        });
    }

    private function createOrder(TableSession $session, array $lines, string $source, ?string $note, ?User $user): Order
    {
        $branch = Branch::whereKey($session->branch_id)->lockForUpdate()->firstOrFail();
        $date = now($branch->timezone)->toDateString();
        $number = (int) Order::where('branch_id', $branch->id)->where('business_date', $date)->max('number') + 1;

        $order = Order::create([
            'branch_id' => $branch->id,
            'table_session_id' => $session->id,
            'dining_table_id' => $session->dining_table_id,
            'public_id' => (string) Str::ulid(),
            'number' => $number,
            'business_date' => $date,
            'source' => $source,
            'status' => 'pending',
            'note' => $note ? Str::limit(trim($note), 500, '') : null,
            'created_by' => $user?->id,
        ]);

        $subtotal = 0;
        foreach ($lines as $line) {
            $total = $line['unit'] * $line['quantity'];
            $subtotal += $total;
            OrderItem::create([
                'order_id' => $order->id,
                'product_id' => $line['product']->id,
                'station_id' => $line['product']->station_id,
                'name' => $line['product']->name,
                'unit_price_cents' => $line['unit'],
                'vat_rate_bps' => $line['product']->vat_rate_bps,
                'quantity' => $line['quantity'],
                'modifiers' => $line['modifiers'] ?: null,
                'line_total_cents' => $total,
                'note' => $line['note'],
                'status' => 'queued',
            ]);
        }
        $order->update(['subtotal_cents' => $subtotal]);

        if ($session->status === 'bill_requested') {
            // A new round re-opens the table for service.
            $session->update(['status' => 'open']);
        }
        $this->emitOrder($order, 'order.created');
        return $order;
    }

    // ---------------------------------------------------------------- accept / cancel

    /** Accept: add price snapshots to the open check immediately, route to stations, reserve stock. */
    public function accept(Order $order, ?User $user): Order
    {
        return DB::transaction(function () use ($order, $user) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->status !== 'pending') {
                if ($order->status === 'cancelled') {
                    throw new DomainError('order_cancelled', 'Поръчката е отказана.', 409);
                }
                return $order; // already accepted — idempotent
            }
            $session = $order->session;
            $check = $this->checks->openCheckFor($session);
            $items = $order->items()->get();
            $fallback = Station::where('branch_id', $order->branch_id)->where('display', 'kitchen')->orderBy('sort')->first();

            foreach ($items->groupBy(fn (OrderItem $i) => $i->station_id ?? $fallback?->id) as $stationId => $group) {
                if (! $stationId) {
                    throw new DomainError('no_station', 'Няма конфигурирана станция за приготвяне.');
                }
                $ticket = PrepTicket::create(['branch_id' => $order->branch_id, 'order_id' => $order->id, 'station_id' => $stationId, 'status' => 'queued']);
                foreach ($group as $item) {
                    if (! $item->station_id) {
                        $item->update(['station_id' => $stationId]);
                    }
                    PrepItem::create(['prep_ticket_id' => $ticket->id, 'order_item_id' => $item->id, 'status' => 'queued']);
                }
            }
            foreach ($items as $item) {
                $this->checks->addOrderItem($check, $item);
                $item->setRelation('order', $order);
                $this->stock->reserveForItem($item);
            }
            $this->checks->recalc($check);

            $order->update(['status' => 'accepted', 'accepted_at' => now(), 'accepted_by' => $user?->id]);
            Audit::record($order->branch, 'order.accepted', $order, ['auto' => $user === null], $user?->id, $user ? 'user' : 'system');
            $this->emitOrder($order, 'order.updated');
            return $order;
        });
    }

    public function cancelOrder(Order $order, User $user, string $reason): Order
    {
        return DB::transaction(function () use ($order, $user, $reason) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (in_array($order->status, ['completed', 'cancelled'], true)) {
                throw new DomainError('order_final', 'Поръчката вече е приключена.', 409);
            }
            foreach ($order->items as $item) {
                if (! in_array($item->status, ['served', 'cancelled'], true)) {
                    $this->cancelItemInternal($item, $user, $reason);
                }
            }
            $order->refresh();
            if ($order->items()->where('status', '!=', 'cancelled')->doesntExist()) {
                $order->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $reason]);
            } else {
                $this->recompute($order);
            }
            Audit::record($order->branch, 'order.cancelled', $order, ['reason' => $reason], $user->id);
            $this->emitOrder($order, 'order.updated');
            return $order;
        });
    }

    public function cancelItem(OrderItem $item, User $user, string $reason): OrderItem
    {
        return DB::transaction(function () use ($item, $user, $reason) {
            $item = OrderItem::whereKey($item->id)->lockForUpdate()->firstOrFail();
            if (in_array($item->status, ['served', 'cancelled'], true)) {
                throw new DomainError('item_final', 'Артикулът вече е сервиран или отказан. Използвайте анулиране от сметката.', 409);
            }
            $this->cancelItemInternal($item, $user, $reason);
            $order = $item->order;
            if ($order->items()->where('status', '!=', 'cancelled')->doesntExist()) {
                $order->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => $reason]);
            } else {
                $this->recompute($order);
            }
            Audit::record($order->branch, 'order_item.cancelled', $item, ['reason' => $reason], $user->id);
            $this->emitOrder($order, 'order.updated');
            return $item;
        });
    }

    private function cancelItemInternal(OrderItem $item, User $user, string $reason): void
    {
        $item->update(['status' => 'cancelled']);
        $prep = $item->prepItem;
        if ($prep && ! in_array($prep->status, ['handed_off', 'cancelled'], true)) {
            $prep->update(['status' => 'cancelled', 'updated_by' => $user->id]);
            $this->recomputeTicket($prep->ticket);
        }
        $this->stock->releaseForItem($item);
        $checkItem = CheckItem::where('order_item_id', $item->id)->whereNull('voided_at')->first();
        if ($checkItem) {
            $check = Check::whereKey($checkItem->check_id)->lockForUpdate()->first();
            if ($check->status !== 'open') {
                throw new DomainError('check_closed', 'Сметката е платена — артикулът не може да бъде отказан.', 409);
            }
            if ($this->checks->itemPaidCents($checkItem) > 0) {
                throw new DomainError('item_paid', 'Артикулът вече е платен.', 409);
            }
            $checkItem->update(['voided_at' => now(), 'voided_by' => $user->id, 'void_reason' => $reason]);
            $this->checks->recalc($check);
        }
    }

    // ---------------------------------------------------------------- preparation

    public function setPrepStatus(PrepItem $prep, string $to, User $user): PrepItem
    {
        return DB::transaction(function () use ($prep, $to, $user) {
            $prep = PrepItem::whereKey($prep->id)->lockForUpdate()->firstOrFail();
            if ($prep->status === $to) {
                return $prep; // idempotent
            }
            if (! in_array($to, self::PREP_TRANSITIONS[$prep->status] ?? [], true)) {
                throw new DomainError('invalid_transition', 'Невалидна промяна на статуса.', 409);
            }
            $now = now();
            $prep->fill(['status' => $to, 'updated_by' => $user->id]);
            if ($to === 'preparing') {
                $prep->started_at ??= $now;
            }
            if ($to === 'ready') {
                $prep->started_at ??= $now;
                $prep->ready_at = $now;
            }
            $prep->save();

            $item = $prep->orderItem;
            $item->update(['status' => $to]);
            if ($to === 'ready') {
                // Explicit consumption event for recipe-tracked items (idempotent ledger).
                $this->stock->consumeForItem($item);
            }
            $this->recomputeTicket($prep->ticket);
            $this->recompute($item->order);
            $this->emitOrder($item->order, 'prep.updated', ['station_id' => $prep->ticket->station_id]);
            return $prep;
        });
    }

    /** Waiter hands off ready items. Ready ≠ served: only ready items can be served. */
    public function serve(Order $order, ?array $orderItemIds, User $user): Order
    {
        return DB::transaction(function () use ($order, $orderItemIds, $user) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $query = $order->items()->where('status', 'ready');
            if ($orderItemIds !== null) {
                $query->whereIn('id', $orderItemIds);
            }
            $items = $query->get();
            if ($items->isEmpty()) {
                throw new DomainError('nothing_ready', 'Няма готови артикули за сервиране.', 409);
            }
            $now = now();
            foreach ($items as $item) {
                $item->update(['status' => 'served', 'served_at' => $now, 'served_by' => $user->id]);
                $prep = $item->prepItem;
                $prep?->update(['status' => 'handed_off', 'handed_off_at' => $now, 'updated_by' => $user->id]);
                if ($prep) {
                    $this->recomputeTicket($prep->ticket);
                }
            }
            $this->recompute($order);
            Audit::record($order->branch, 'order.served', $order, ['items' => $items->pluck('id')], $user->id);
            $this->emitOrder($order, 'order.updated');
            return $order->fresh();
        });
    }

    public function recomputeTicket(PrepTicket $ticket): void
    {
        $statuses = $ticket->items()->pluck('status')->reject(fn ($s) => $s === 'cancelled');
        $status = match (true) {
            $statuses->isEmpty() => 'cancelled',
            $statuses->every(fn ($s) => $s === 'handed_off') => 'handed_off',
            $statuses->every(fn ($s) => in_array($s, ['ready', 'handed_off'], true)) => 'ready',
            $statuses->contains(fn ($s) => in_array($s, ['preparing', 'ready', 'handed_off'], true)) => 'preparing',
            default => 'queued',
        };
        $ticket->status = $status;
        if ($status === 'preparing') {
            $ticket->started_at ??= now();
        }
        if ($status === 'ready') {
            $ticket->ready_at ??= now();
        }
        $ticket->save();
    }

    /** Derive the order aggregate from its items, respecting the transition table. */
    public function recompute(Order $order): Order
    {
        if (in_array($order->status, ['pending', 'cancelled', 'completed'], true)) {
            return $order;
        }
        $statuses = $order->items()->pluck('status')->reject(fn ($s) => $s === 'cancelled');
        $next = match (true) {
            $statuses->isEmpty() => 'cancelled',
            $statuses->every(fn ($s) => $s === 'served') => 'served',
            $statuses->every(fn ($s) => in_array($s, ['ready', 'served'], true)) => 'ready',
            $statuses->contains(fn ($s) => in_array($s, ['ready', 'served'], true)) => 'partially_ready',
            $statuses->contains('preparing') => 'in_preparation',
            default => 'accepted',
        };
        if ($next !== $order->status) {
            if (! $order->canTransitionTo($next)) {
                throw new DomainError('invalid_transition', "Невалиден преход {$order->status} → {$next}.", 409);
            }
            $order->status = $next;
            if ($next === 'ready') {
                $order->ready_at ??= now();
            }
            if ($next === 'served') {
                $order->served_at = now();
            }
            $order->save();
        }
        return $order;
    }

    /** After settlement: served orders of the session become completed. */
    public function completeServedOrders(TableSession $session): void
    {
        Order::where('table_session_id', $session->id)->where('status', 'served')
            ->update(['status' => 'completed', 'completed_at' => now()]);
    }

    // ---------------------------------------------------------------- table operations

    public function transfer(TableSession $session, DiningTable $target, User $user): TableSession
    {
        return DB::transaction(function () use ($session, $target, $user) {
            $tables = DiningTable::whereIn('id', collect([$session->dining_table_id, $target->id])->sort()->values())->lockForUpdate()->get();
            if ($target->branch_id !== $session->branch_id) {
                throw new DomainError('invalid_table', 'Масата не е в този обект.', 404);
            }
            if ($this->activeSession($target)) {
                throw new DomainError('table_busy', "Маса {$target->label} е заета.", 409);
            }
            $from = $session->dining_table_id;
            $session->update(['dining_table_id' => $target->id]);
            Order::where('table_session_id', $session->id)->update(['dining_table_id' => $target->id]);
            \App\Models\ServiceRequest::where('table_session_id', $session->id)->update(['dining_table_id' => $target->id]);
            Audit::record($session->branch, 'session.transfer', $session, ['from_table_id' => $from, 'to_table_id' => $target->id], $user->id);
            Realtime::emit($session->branch_id, 'table.updated', ['table_id' => $target->id, 'from_table_id' => $from]);
            return $session;
        });
    }

    public function clearTable(TableSession $session, User $user): TableSession
    {
        return DB::transaction(function () use ($session, $user) {
            $session = TableSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            if ($session->status === 'closed') {
                return $session;
            }
            $unpaid = Check::where('table_session_id', $session->id)->where('status', 'open')->get()
                ->filter(fn (Check $c) => $c->total_cents > 0 || $c->activeItems()->exists());
            if ($unpaid->isNotEmpty()) {
                throw new DomainError('unpaid_checks', 'Масата има неплатена сметка.', 409);
            }
            $unserved = Order::where('table_session_id', $session->id)
                ->whereIn('status', ['pending', 'accepted', 'in_preparation', 'partially_ready', 'ready'])->exists();
            if ($unserved) {
                throw new DomainError('unserved_items', 'Има несервирани или неприети поръчки на масата.', 409);
            }
            Check::where('table_session_id', $session->id)->where('status', 'open')->update(['status' => 'void']);
            $this->completeServedOrders($session);
            $session->serviceRequests()->where('status', '!=', 'done')->update(['status' => 'done', 'done_at' => now(), 'handled_by' => $user->id]);
            $session->update(['status' => 'closed', 'closed_at' => now()]);
            Audit::record($session->branch, 'session.cleared', $session, [], $user->id);
            Realtime::emit($session->branch_id, 'table.updated', ['table_id' => $session->dining_table_id]);
            Realtime::emit(null, 'session.updated', ['status' => 'closed'], $session->guest_token);
            return $session;
        });
    }

    // ---------------------------------------------------------------- helpers

    public function emitOrder(Order $order, string $event, array $extra = []): void
    {
        $payload = ['order_id' => $order->id, 'public_id' => $order->public_id, 'status' => $order->status, 'table_id' => $order->dining_table_id] + $extra;
        Realtime::emit($order->branch_id, $event, $payload);
        $token = TableSession::whereKey($order->table_session_id)->value('guest_token');
        Realtime::emit(null, 'order.updated', ['public_id' => $order->public_id, 'status' => $order->status], $token);
    }

    public static function sessionOrders(TableSession $session): Collection
    {
        return Order::where('table_session_id', $session->id)->with('items')->orderBy('id')->get();
    }
}
