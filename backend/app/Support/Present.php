<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\Check;
use App\Models\CheckItem;
use App\Models\DiningTable;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\TableSession;

/** Explicit, whitelisted JSON shapes (never dump raw models to clients). */
final class Present
{
    public static function publicProduct(Product $p): array
    {
        return [
            'id' => $p->id,
            'name' => $p->name,
            'description' => (string) $p->description,
            'ingredients' => $p->ingredients,
            'allergens' => $p->allergens ?? [],
            'price_cents' => $p->price_cents,
            'portion' => $p->portion,
            'image_url' => $p->image_url,
            'art' => $p->art,
            'nutrition' => $p->nutrition,
            'is_available' => $p->is_available,
            'modifier_groups' => $p->modifierGroups->map(fn ($g) => [
                'id' => $g->id,
                'name' => $g->name,
                'kind' => $g->kind,
                'min' => $g->min_select,
                'max' => $g->max_select,
                'options' => $g->options->where('is_available', true)->values()->map(fn ($o) => [
                    'id' => $o->id, 'name' => $o->name, 'price_delta_cents' => $o->price_delta_cents,
                ]),
            ]),
        ];
    }

    public static function staffProduct(Product $p): array
    {
        return self::publicProduct($p) + [
            'category_id' => $p->category_id,
            'station_id' => $p->station_id,
            'sku' => $p->sku,
            'vat_rate_bps' => $p->vat_rate_bps,
            'is_published' => $p->is_published,
            'auto_unavailable_on_low_stock' => $p->auto_unavailable_on_low_stock,
            'sort' => $p->sort,
            'has_recipe' => $p->relationLoaded('recipeItems') ? $p->recipeItems->isNotEmpty() : null,
        ];
    }

    public static function orderItem(OrderItem $i, bool $staff = false): array
    {
        $base = [
            'id' => $i->id,
            'name' => $i->name,
            'quantity' => $i->quantity,
            'modifiers' => collect($i->modifiers ?? [])->pluck('name')->all(),
            'note' => $i->note,
            'unit_price_cents' => $i->unit_price_cents,
            'line_total_cents' => $i->line_total_cents,
            'status' => $i->status,
        ];
        if ($staff) {
            $base += [
                'station_id' => $i->station_id,
                'served_at' => $i->served_at?->toIso8601String(),
                'prep_item_id' => $i->relationLoaded('prepItem') ? $i->prepItem?->id : null,
            ];
        }
        return $base;
    }

    public static function publicOrder(Order $o): array
    {
        return [
            'public_id' => $o->public_id,
            'number' => $o->number,
            'status' => $o->status,
            'note' => $o->note,
            'total_cents' => $o->items->where('status', '!=', 'cancelled')->sum('line_total_cents'),
            'created_at' => $o->created_at->toIso8601String(),
            'items' => $o->items->map(fn ($i) => self::orderItem($i))->values(),
        ];
    }

    public static function staffOrder(Order $o): array
    {
        return [
            'id' => $o->id,
            'public_id' => $o->public_id,
            'number' => $o->number,
            'status' => $o->status,
            'source' => $o->source,
            'note' => $o->note,
            'table_id' => $o->dining_table_id,
            'table_label' => $o->relationLoaded('table') ? $o->table?->label : null,
            'session_id' => $o->table_session_id,
            'subtotal_cents' => $o->subtotal_cents,
            'created_at' => $o->created_at->toIso8601String(),
            'accepted_at' => $o->accepted_at?->toIso8601String(),
            'items' => $o->items->map(fn ($i) => self::orderItem($i, true))->values(),
        ];
    }

    public static function check(Check $c): array
    {
        $items = $c->items()->with('allocations')->orderBy('id')->get();
        return [
            'id' => $c->id,
            'seq' => $c->seq,
            'status' => $c->status,
            'subtotal_cents' => $c->subtotal_cents,
            'discount_cents' => $c->discount_cents,
            'discount_reason' => $c->discount_reason,
            'service_charge_cents' => $c->service_charge_cents,
            'total_cents' => $c->total_cents,
            'paid_cents' => $c->paid_cents,
            'due_cents' => $c->dueCents(),
            'tip_cents' => $c->tip_cents,
            'version' => $c->version,
            'vat_breakdown' => self::vat($items->whereNull('voided_at')),
            'items' => $items->map(fn (CheckItem $i) => [
                'id' => $i->id,
                'order_item_id' => $i->order_item_id,
                'name' => $i->name,
                'quantity' => $i->quantity,
                'unit_price_cents' => $i->unit_price_cents,
                'total_cents' => $i->total_cents,
                'paid_cents' => (int) $i->allocations->sum('amount_cents'),
                'voided' => $i->voided_at !== null,
                'void_reason' => $i->void_reason,
            ])->values(),
            'payments' => $c->payments()->orderBy('id')->get()->map(fn ($p) => [
                'id' => $p->id,
                'method' => $p->method,
                'mode' => $p->mode,
                'amount_cents' => $p->amount_cents,
                'tip_cents' => $p->tip_cents,
                'tendered_cents' => $p->tendered_cents,
                'change_cents' => $p->change_cents,
                'reference' => $p->reference,
                'is_simulated' => $p->is_simulated,
                'created_at' => $p->created_at->toIso8601String(),
            ])->values(),
        ];
    }

    /** VAT included in gross prices, grouped by rate (informative, not a fiscal receipt). */
    private static function vat($items): array
    {
        return $items->groupBy('vat_rate_bps')->map(function ($group, $bps) {
            $gross = (int) $group->sum('total_cents');
            $vat = intdiv($gross * (int) $bps + intdiv(10000 + (int) $bps, 2), 10000 + (int) $bps);
            return ['rate_bps' => (int) $bps, 'gross_cents' => $gross, 'vat_cents' => $vat];
        })->values()->all();
    }

    public static function tableLive(DiningTable $t, ?TableSession $s): array
    {
        $status = 'available';
        $flags = [];
        if ($s) {
            $orders = $s->relationLoaded('orders') ? $s->orders : collect();
            $status = 'occupied';
            if ($orders->contains(fn ($o) => in_array($o->status, ['ready', 'partially_ready'], true))) {
                $flags[] = 'ready';
            }
            if ($orders->contains(fn ($o) => $o->status === 'pending')) {
                $flags[] = 'pending';
            }
            if ($s->status === 'bill_requested') {
                $status = 'bill';
            }
            if ($s->status === 'settled') {
                $status = 'settled';
            }
            if ($s->relationLoaded('serviceRequests') && $s->serviceRequests->contains(fn ($r) => $r->type === 'waiter' && $r->status !== 'done')) {
                $flags[] = 'call';
            }
        }
        return [
            'id' => $t->id,
            'number' => $t->number,
            'label' => $t->label,
            'seats' => $t->seats,
            'shape' => $t->shape,
            'x' => $t->x,
            'y' => $t->y,
            'width' => $t->width,
            'height' => $t->height,
            'rotation' => $t->rotation,
            'floor_area_id' => $t->floor_area_id,
            'status' => $status,
            'flags' => $flags,
            'session' => $s ? [
                'id' => $s->id,
                'status' => $s->status,
                'opened_at' => $s->opened_at->toIso8601String(),
                'waiter' => $s->waiter?->name,
                'total_cents' => $s->relationLoaded('checks') ? (int) $s->checks->where('status', '!=', 'void')->sum('total_cents') : null,
                'due_cents' => $s->relationLoaded('checks') ? (int) $s->checks->where('status', 'open')->sum(fn ($c) => $c->dueCents()) : null,
            ] : null,
        ];
    }

    public static function branch(Branch $b): array
    {
        return [
            'id' => $b->id,
            'organization_id' => $b->organization_id,
            'name' => $b->name,
            'brand_name' => $b->brand_name,
            'phone' => $b->phone,
            'email' => $b->email,
            'address' => $b->address,
            'city' => $b->city,
            'timezone' => $b->timezone,
            'currency' => $b->currency,
            'opening_hours' => $b->opening_hours,
            'settings' => $b->resolvedSettings(),
            'onboarding' => $b->onboarding,
            'onboarding_completed_at' => $b->onboarding_completed_at?->toIso8601String(),
        ];
    }
}
