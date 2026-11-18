<?php

namespace App\Domain\Onboarding;

use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\FloorArea;
use App\Models\Organization;
use App\Models\Station;
use App\Support\Tokens;
use Illuminate\Support\Str;

class BranchProvisioner
{
    public const ONBOARDING_STEPS = ['identity', 'floor', 'menu', 'routing', 'staff', 'inventory', 'qr', 'test_order'];

    public const DEFAULT_STATIONS = [
        ['code' => 'hot', 'name' => 'Топла кухня', 'display' => 'kitchen', 'color' => '#ff6b3d'],
        ['code' => 'cold', 'name' => 'Студена кухня', 'display' => 'kitchen', 'color' => '#3dd6ff'],
        ['code' => 'bar', 'name' => 'Бар', 'display' => 'bar', 'color' => '#c77dff'],
        ['code' => 'dessert', 'name' => 'Десерти и кафе', 'display' => 'kitchen', 'color' => '#ffd166'],
    ];

    public function createBranch(Organization $org, string $name): Branch
    {
        $branch = Branch::create([
            'organization_id' => $org->id,
            'name' => $name,
            'slug' => Str::slug($name) ?: 'branch-'.Str::lower(Str::random(4)),
            'brand_name' => $name,
            'settings' => Branch::DEFAULT_SETTINGS,
            'onboarding' => ['completed_steps' => [], 'current' => 'identity'],
        ]);
        foreach (self::DEFAULT_STATIONS as $i => $s) {
            Station::create($s + ['branch_id' => $branch->id, 'sort' => $i]);
        }
        FloorArea::create(['branch_id' => $branch->id, 'name' => 'Зала', 'kind' => 'indoor', 'sort' => 0]);
        return $branch;
    }

    public static function newTable(Branch $branch, array $attrs): DiningTable
    {
        return DiningTable::create($attrs + ['branch_id' => $branch->id, 'qr_token' => Tokens::random(24)]);
    }
}
