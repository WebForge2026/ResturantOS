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

    /** The exact acceptance scenario cart: 2 burgers, 1 salad, 2 colas. */
    protected function scenarioItems(): array
    {
        return [
            ['product_id' => $this->product('NOAR Смаш бургер')->id, 'quantity' => 2, 'modifier_ids' => [$this->option('NOAR Смаш бургер', 'Средно')]],
            ['product_id' => $this->product('Цезар с пушено пиле')->id, 'quantity' => 1, 'modifier_ids' => []],
            ['product_id' => $this->product('Кока-Кола 330 мл')->id, 'quantity' => 2, 'modifier_ids' => [$this->option('Кока-Кола 330 мл', 'Класик')]],
        ];
    }
}
