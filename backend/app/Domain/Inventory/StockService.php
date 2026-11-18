<?php

namespace App\Domain\Inventory;

use App\Domain\Realtime\Realtime;
use App\Models\Branch;
use App\Models\Ingredient;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\RecipeItem;
use App\Models\StockMovement;
use App\Support\DomainError;
use Illuminate\Support\Facades\DB;

/**
 * Inventory ledger.
 *
 * Lifecycle for recipe-tracked order items:
 *   accepted  -> "reserve"  (reserved += qty)
 *   ready     -> "consume"  (on_hand -= qty, reserved -= reserved qty)   ← the explicit consumption event
 *   cancelled -> "release"  (reserved -= qty) if not yet consumed
 * Every order-driven movement has a dedupe_key (unique) so retries/duplicate events never double-count.
 * Products without a recipe produce no movements (we never invent usage).
 */
class StockService
{
    public function reserveForItem(OrderItem $item): void
    {
        $branch = $item->order->branch;
        if (! $branch->setting('stock_reservation_enabled')) {
            return;
        }
        foreach ($this->recipe($item) as $ri) {
            $qty = round((float) $ri->quantity * $item->quantity, 3);
            $this->move($ri->ingredient_id, 'reserve', 0, $qty, "reserve:{$item->id}:{$ri->ingredient_id}", ['order_item_id' => $item->id]);
        }
    }

    public function consumeForItem(OrderItem $item): void
    {
        foreach ($this->recipe($item) as $ri) {
            $qty = round((float) $ri->quantity * $item->quantity, 3);
            $reserved = $this->hasMovement("reserve:{$item->id}:{$ri->ingredient_id}")
                && ! $this->hasMovement("release:{$item->id}:{$ri->ingredient_id}");
            $this->move($ri->ingredient_id, 'consume', -$qty, $reserved ? -$qty : 0, "consume:{$item->id}:{$ri->ingredient_id}", ['order_item_id' => $item->id]);
        }
    }

    public function releaseForItem(OrderItem $item): void
    {
        foreach ($this->recipe($item) as $ri) {
            if (! $this->hasMovement("reserve:{$item->id}:{$ri->ingredient_id}") || $this->hasMovement("consume:{$item->id}:{$ri->ingredient_id}")) {
                continue;
            }
            $qty = round((float) $ri->quantity * $item->quantity, 3);
            $this->move($ri->ingredient_id, 'release', 0, -$qty, "release:{$item->id}:{$ri->ingredient_id}", ['order_item_id' => $item->id]);
        }
    }

    /** Manual movements: receipt (+), waste (-), adjust (signed), opening (+). */
    public function manual(Ingredient $ingredient, string $type, float $delta, ?string $note, ?int $userId, array $extra = []): StockMovement
    {
        if (! in_array($type, ['receipt', 'waste', 'adjust', 'opening'], true)) {
            throw new DomainError('invalid_movement', 'Невалиден тип движение.');
        }
        return $this->move($ingredient->id, $type, $delta, 0, null, $extra + ['user_id' => $userId, 'note' => $note]);
    }

    private function recipe(OrderItem $item)
    {
        if (! $item->product_id) {
            return collect();
        }
        return RecipeItem::where('product_id', $item->product_id)->get();
    }

    private function hasMovement(string $dedupe): bool
    {
        return StockMovement::where('dedupe_key', $dedupe)->exists();
    }

    private function move(int $ingredientId, string $type, float $onHandDelta, float $reservedDelta, ?string $dedupe, array $extra = []): ?StockMovement
    {
        return DB::transaction(function () use ($ingredientId, $type, $onHandDelta, $reservedDelta, $dedupe, $extra) {
            $ing = Ingredient::whereKey($ingredientId)->lockForUpdate()->firstOrFail();
            if ($dedupe && StockMovement::where('dedupe_key', $dedupe)->exists()) {
                return null; // already applied — idempotent
            }
            $wasLow = $ing->isLow();
            $ing->on_hand = round((float) $ing->on_hand + $onHandDelta, 3);
            $ing->reserved = max(0, round((float) $ing->reserved + $reservedDelta, 3));
            $ing->save();

            $movement = StockMovement::create([
                'branch_id' => $ing->branch_id,
                'ingredient_id' => $ing->id,
                'type' => $type,
                'quantity' => in_array($type, ['reserve', 'release'], true) ? $reservedDelta : $onHandDelta,
                'on_hand_after' => $ing->on_hand,
                'reserved_after' => $ing->reserved,
                'dedupe_key' => $dedupe,
            ] + $extra);

            if (! $wasLow && $ing->isLow()) {
                $this->onLowStock($ing);
            }
            return $movement;
        });
    }

    private function onLowStock(Ingredient $ing): void
    {
        // Optional rule: products flagged for auto-unavailability are hidden when an ingredient runs low.
        $productIds = RecipeItem::where('ingredient_id', $ing->id)->pluck('product_id');
        Product::whereIn('id', $productIds)->where('auto_unavailable_on_low_stock', true)->update(['is_available' => false]);
        Realtime::emit($ing->branch_id, 'stock.low', ['ingredient_id' => $ing->id, 'name' => $ing->name]);
    }

    /** Simple rule-based reorder suggestion (not AI): below min → bring back to min + reorder_qty. */
    public static function reorderSuggestions(Branch $branch): array
    {
        return $branch->ingredients()->with('supplier')->get()
            ->filter(fn (Ingredient $i) => $i->isLow())
            ->map(fn (Ingredient $i) => [
                'ingredient_id' => $i->id,
                'name' => $i->name,
                'unit' => $i->unit,
                'on_hand' => (float) $i->on_hand,
                'min_level' => (float) $i->min_level,
                'suggested_qty' => round(max((float) $i->reorder_qty, (float) $i->min_level * 2 - (float) $i->on_hand), 3),
                'supplier' => $i->supplier?->name,
            ])->values()->all();
    }
}
