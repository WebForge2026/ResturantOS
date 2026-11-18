<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Domain\Inventory\StockService;
use App\Http\Controllers\Controller;
use App\Models\Ingredient;
use App\Models\Product;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\RecipeItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function __construct(private StockService $stock) {}

    public function ingredients(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $items = $branch->ingredients()->with('supplier:id,name')->orderBy('name')->get();
        return response()->json([
            'data' => $items->map(fn (Ingredient $i) => [
                'id' => $i->id, 'name' => $i->name, 'unit' => $i->unit,
                'on_hand' => (float) $i->on_hand, 'reserved' => (float) $i->reserved,
                'available' => round((float) $i->on_hand - (float) $i->reserved, 3),
                'min_level' => (float) $i->min_level, 'reorder_qty' => (float) $i->reorder_qty,
                'location' => $i->location, 'supplier' => $i->supplier?->only(['id', 'name']),
                'is_low' => $i->isLow(),
                'cost_per_unit_millicents' => $i->cost_per_unit_millicents,
            ]),
            'reorder' => StockService::reorderSuggestions($branch),
        ]);
    }

    public function saveIngredient(Request $request, ?int $ingredientId = null): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('ingredients')->where('branch_id', $branch->id)->ignore($ingredientId)],
            'unit' => ['required', Rule::in(['g', 'ml', 'pcs'])],
            'min_level' => ['required', 'numeric', 'min:0'],
            'reorder_qty' => ['nullable', 'numeric', 'min:0'],
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')->where('branch_id', $branch->id)],
            'cost_per_unit_millicents' => ['nullable', 'integer', 'min:0'],
            'opening_qty' => ['nullable', 'numeric', 'min:0'],
        ]);
        $ingredient = DB::transaction(function () use ($branch, $data, $ingredientId, $request) {
            $ing = $ingredientId ? $this->own(Ingredient::find($ingredientId), $branch) : new Ingredient(['branch_id' => $branch->id]);
            $ing->fill(collect($data)->except('opening_qty')->all())->save();
            if (! $ingredientId && ! empty($data['opening_qty'])) {
                $this->stock->manual($ing, 'opening', (float) $data['opening_qty'], 'Начално количество', $request->user()->id);
            }
            return $ing;
        });
        Audit::record($branch, 'ingredient.saved', $ingredient);
        return response()->json(['ingredient' => $ingredient->fresh()], $ingredientId ? 200 : 201);
    }

    /** Stocktake adjustment (set counted quantity) or waste write-off. */
    public function adjust(Request $request, int $ingredientId): JsonResponse
    {
        $branch = $this->branch($request);
        $ing = $this->own(Ingredient::find($ingredientId), $branch);
        $data = $request->validate([
            'type' => ['required', Rule::in(['count', 'waste'])],
            'quantity' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        $movement = $data['type'] === 'waste'
            ? $this->stock->manual($ing, 'waste', -(float) $data['quantity'], $data['note'] ?? 'Брак', $request->user()->id)
            : $this->stock->manual($ing, 'adjust', round((float) $data['quantity'] - (float) $ing->on_hand, 3), $data['note'] ?? 'Инвентаризация', $request->user()->id);
        Audit::record($branch, 'stock.'.$data['type'], $ing, $data);
        return response()->json(['movement' => $movement, 'ingredient' => $ing->fresh()]);
    }

    public function movements(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate(['ingredient_id' => ['nullable', 'integer'], 'type' => ['nullable', 'string']]);
        $q = StockMovement::where('branch_id', $branch->id)->with('ingredient:id,name,unit', 'user:id,name')->latest('id');
        if (! empty($data['ingredient_id'])) $q->where('ingredient_id', $data['ingredient_id']);
        if (! empty($data['type'])) $q->where('type', $data['type']);
        return response()->json(['data' => $q->limit(300)->get()->map(fn ($m) => [
            'id' => $m->id, 'type' => $m->type, 'quantity' => (float) $m->quantity, 'on_hand_after' => (float) $m->on_hand_after,
            'reserved_after' => (float) $m->reserved_after, 'ingredient' => $m->ingredient?->only(['id', 'name', 'unit']),
            'order_item_id' => $m->order_item_id, 'user' => $m->user?->name, 'note' => $m->note, 'created_at' => $m->created_at?->toIso8601String(),
        ])]);
    }

    public function suppliers(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->branch($request)->suppliers()->orderBy('name')->get()]);
    }

    public function saveSupplier(Request $request, ?int $supplierId = null): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'], 'contact_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'], 'email' => ['nullable', 'email'], 'vat_number' => ['nullable', 'string', 'max:32'],
        ]);
        $s = $supplierId ? $this->own(Supplier::find($supplierId), $branch) : new Supplier(['branch_id' => $branch->id]);
        $s->fill($data)->save();
        Audit::record($branch, 'supplier.saved', $s);
        return response()->json(['supplier' => $s]);
    }

    public function receive(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'supplier_id' => ['nullable', 'integer', Rule::exists('suppliers', 'id')->where('branch_id', $branch->id)],
            'reference' => ['nullable', 'string', 'max:80'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.ingredient_id' => ['required', 'integer', Rule::exists('ingredients', 'id')->where('branch_id', $branch->id)],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.total_cents' => ['nullable', 'integer', 'min:0'],
        ]);
        $receipt = DB::transaction(function () use ($branch, $data, $request) {
            $receipt = PurchaseReceipt::create([
                'branch_id' => $branch->id, 'supplier_id' => $data['supplier_id'] ?? null, 'user_id' => $request->user()->id,
                'reference' => $data['reference'] ?? null, 'received_at' => now(),
                'total_cents' => collect($data['items'])->sum(fn ($i) => $i['total_cents'] ?? 0),
            ]);
            foreach ($data['items'] as $line) {
                PurchaseReceiptItem::create($line + ['purchase_receipt_id' => $receipt->id, 'total_cents' => $line['total_cents'] ?? 0]);
                $this->stock->manual(Ingredient::find($line['ingredient_id']), 'receipt', (float) $line['quantity'], 'Доставка '.($data['reference'] ?? ''), $request->user()->id, ['purchase_receipt_id' => $receipt->id]);
            }
            return $receipt;
        });
        Audit::record($branch, 'stock.received', $receipt);
        return response()->json(['receipt' => $receipt->load('items')], 201);
    }

    public function recipe(Request $request, int $productId): JsonResponse
    {
        $product = $this->own(Product::find($productId), $this->branch($request));
        return response()->json(['data' => $product->recipeItems()->with('ingredient:id,name,unit')->get()->map(fn ($r) => [
            'ingredient_id' => $r->ingredient_id, 'name' => $r->ingredient->name, 'unit' => $r->ingredient->unit, 'quantity' => (float) $r->quantity,
        ])]);
    }

    public function saveRecipe(Request $request, int $productId): JsonResponse
    {
        $branch = $this->branch($request);
        $product = $this->own(Product::find($productId), $branch);
        $data = $request->validate([
            'items' => ['present', 'array'],
            'items.*.ingredient_id' => ['required', 'integer', 'distinct', Rule::exists('ingredients', 'id')->where('branch_id', $branch->id)],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
        ]);
        DB::transaction(function () use ($product, $data) {
            $product->recipeItems()->delete();
            foreach ($data['items'] as $i) {
                RecipeItem::create(['product_id' => $product->id, 'ingredient_id' => $i['ingredient_id'], 'quantity' => $i['quantity']]);
            }
        });
        Audit::record($branch, 'recipe.saved', $product, ['items' => count($data['items'])]);
        return $this->recipe($request, $productId);
    }
}
