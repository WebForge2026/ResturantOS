<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

abstract class NoarTestCase extends TestCase
{
    use RefreshDatabase;

    protected bool $seed = true;

    protected function noar(): Branch
    {
        return Branch::where('slug', 'noar-sofia')->firstOrFail();
    }

    protected function actingAsEmail(string $email): User
    {
        $user = User::where('email', $email)->firstOrFail();
        Sanctum::actingAs($user);
        return $user;
    }

    protected function token(int $number): string
    {
        return DiningTable::where('branch_id', $this->noar()->id)->where('number', $number)->value('qr_token');
    }

    protected function product(string $name): Product
    {
        return Product::where('name', $name)->with('modifierGroups.options')->firstOrFail();
    }

    protected function option(string $product, string $option): int
    {
        return $this->product($product)->modifierGroups->flatMap->options->firstWhere('name', $option)->id;
    }

    protected function b(string $path): string
    {
        return '/api/v1/branches/'.$this->noar()->id.$path;
    }

    protected function guestOrder(int $table, array $items, ?string $note = null, ?string $key = null)
    {
        return $this->postJson("/api/v1/public/tables/{$this->token($table)}/orders", ['items' => $items, 'note' => $note], ['Idempotency-Key' => $key ?? (string) Str::uuid()]);
    }

    /** The exact acceptance scenario cart: 2 burgers (10,00), 1 salad (12,50), 2 colas (2,50) = 37,50 €. */
    protected function scenarioItems(): array
    {
        return [
            ['product_id' => $this->product('Бургер телешки')->id, 'quantity' => 2, 'modifier_ids' => []],
            ['product_id' => $this->product('Цезар')->id, 'quantity' => 1, 'modifier_ids' => []],
            ['product_id' => $this->product(self::COLA)->id, 'quantity' => 2, 'modifier_ids' => []],
        ];
    }

    protected const COLA = 'Coca-Cola Original Taste 1л';

    /** The imported menu has no variants; tests that need them add test-only groups. */
    protected function addTestVariants(): void
    {
        $add = function (string $product, string $group, int $min, array $options) {
            $g = \App\Models\ModifierGroup::create(['product_id' => $this->product($product)->id, 'name' => $group, 'kind' => 'variant', 'min_select' => $min, 'max_select' => 1]);
            foreach ($options as $i => [$name, $delta]) {
                \App\Models\ModifierOption::create(['modifier_group_id' => $g->id, 'name' => $name, 'price_delta_cents' => $delta, 'sort' => $i]);
            }
        };
        $add('Бургер телешки', 'Изпичане', 1, [['Средно', 0], ['Добре изпечено', 0]]);
        $add('Маргарита', 'Размер', 1, [['32 см', 0], ['40 см', 450]]);
        $add('Пеперони', 'Размер', 1, [['32 см', 0], ['40 см', 450]]);
    }
}
