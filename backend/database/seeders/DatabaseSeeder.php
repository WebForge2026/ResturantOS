<?php

namespace Database\Seeders;

use App\Domain\Billing\PaymentService;
use App\Domain\Inventory\StockService;
use App\Domain\Onboarding\BranchProvisioner;
use App\Domain\Orders\OrderService;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Check;
use App\Models\FloorArea;
use App\Models\Ingredient;
use App\Models\Membership;
use App\Models\ModifierGroup;
use App\Models\ModifierOption;
use App\Models\Order;
use App\Models\Organization;
use App\Models\PosShift;
use App\Models\Product;
use App\Models\RecipeItem;
use App\Models\Station;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/**
 * LOCAL DEMO SEED — NOAR BAR & DINNER.
 * Menu (categories, dishes, prices, photos) is imported from NOAR's public Wolt menu (see scripts/import-wolt-menu.py).
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('Demo seeding is disabled in production.');
        }
        config(['broadcasting.default' => 'null']);
        $password = config('noar.demo_password') ?: 'noar-demo-2026';

        // ------------------------------------------------------------------ org + branch
        $org = Organization::create(['name' => 'NOAR Hospitality (демо)', 'slug' => 'noar', 'status' => 'active']);
        $branch = Branch::create([
            'organization_id' => $org->id,
            'name' => 'NOAR BAR & DINNER',
            'slug' => config('noar.demo_branch_slug'),
            'brand_name' => 'NOAR BAR & DINNER',
            'phone' => '+359 88 000 0000',
            'email' => 'hello@noar.local',
            'address' => 'ул. Примерна 4 (демо адрес)',
            'city' => 'София',
            'settings' => Branch::DEFAULT_SETTINGS,
            'opening_hours' => collect(range(1, 7))->map(fn ($d) => ['day' => $d, 'open' => '12:00', 'close' => $d >= 5 ? '02:00' : '00:00', 'closed' => false])->all(),
            'onboarding' => ['completed_steps' => BranchProvisioner::ONBOARDING_STEPS, 'current' => 'test_order'],
            'onboarding_completed_at' => now(),
        ]);
        $stations = collect(BranchProvisioner::DEFAULT_STATIONS)->map(fn ($s, $i) => Station::create($s + ['branch_id' => $branch->id, 'sort' => $i]))->keyBy('code');

        // ------------------------------------------------------------------ users
        $mk = function (string $name, string $email, ?string $role, ?string $pin = null, bool $platform = false) use ($password, $org, $branch) {
            $u = User::create(['name' => $name, 'email' => $email, 'password' => $password]);
            $u->forceFill(['email_verified_at' => now(), 'is_platform_admin' => $platform, 'pin_hash' => $pin ? Hash::make($pin) : null])->save();
            if ($role) {
                Membership::create(['user_id' => $u->id, 'organization_id' => $org->id, 'branch_id' => $role === 'owner' ? null : $branch->id, 'role' => $role]);
            }
            return $u;
        };
        $mk('Николай Стоянов', 'owner@noar.local', 'owner', '1234');
        $mk('Мария Петрова', 'manager@noar.local', 'manager', '2345');
        $waiter = $mk('Иван Георгиев', 'waiter@noar.local', 'waiter', '1111');
        $mk('Елена Димитрова', 'waiter2@noar.local', 'waiter', '1112');
        $cashier = $mk('Стефан Иванов', 'cashier@noar.local', 'cashier', '3333');
        $mk('Георги Колев', 'kitchen@noar.local', 'kitchen', '4444');
        $mk('Виктория Ангелова', 'bar@noar.local', 'bartender', '5555');
        $mk('Петър Николов', 'stock@noar.local', 'stock_manager', '6666');
        $mk('Платформен администратор', 'admin@platform.local', null, null, true);

        // ------------------------------------------------------------------ floor
        $indoor = FloorArea::create(['branch_id' => $branch->id, 'name' => 'Основна зала', 'kind' => 'indoor', 'sort' => 0]);
        $terrace = FloorArea::create(['branch_id' => $branch->id, 'name' => 'Тераса', 'kind' => 'terrace', 'sort' => 1]);
        for ($n = 1; $n <= 15; $n++) {
            $inside = $n <= 10;
            $i = $inside ? $n - 1 : $n - 11;
            $shape = $inside ? ($n % 3 === 0 ? 'rect' : ($n % 2 ? 'square' : 'round')) : 'round';
            BranchProvisioner::newTable($branch, [
                'floor_area_id' => $inside ? $indoor->id : $terrace->id,
                'number' => $n,
                'label' => sprintf('Маса %02d', $n),
                'seats' => $shape === 'rect' ? 6 : ($shape === 'round' ? 2 + ($n % 3) : 4),
                'shape' => $shape,
                'x' => $inside ? 80 + ($i % 5) * 210 : 120 + $i * 200,
                'y' => $inside ? 90 + intdiv($i, 5) * 230 : 160,
                'width' => $shape === 'rect' ? 150 : 96,
                'height' => 96,
                'rotation' => 0,
            ]);
        }

        // ------------------------------------------------------------------ inventory
        $sup = Supplier::create(['branch_id' => $branch->id, 'name' => 'Свежест ООД (демо)', 'contact_name' => 'Андрей', 'phone' => '+359 88 111 2222']);
        $sup2 = Supplier::create(['branch_id' => $branch->id, 'name' => 'Бар Дистрибуция (демо)', 'phone' => '+359 88 333 4444']);
        $stock = app(StockService::class);
        $ing = [];
        foreach ([
            ['Телешка кайма', 'g', 16000, 2000, $sup, 1800], ['Пилешко филе', 'g', 12000, 2000, $sup, 1100], ['Хлебче за бургер', 'pcs', 140, 20, $sup, 45000],
            ['Чедър', 'g', 4000, 600, $sup, 2200], ['Айсберг', 'g', 5000, 800, $sup, 600], ['Пармезан', 'g', 3000, 400, $sup, 3500],
            ['Филе сьомга', 'g', 7000, 1200, $sup, 3800], ['Тесто за пица', 'pcs', 160, 15, $sup, 40000], ['Кашкавал', 'g', 20000, 2000, $sup, 1400],
            ['Доматен сос', 'g', 8000, 1000, $sup, 500], ['Телешко филе', 'g', 6000, 1000, $sup, 6500], ['Картофи', 'g', 30000, 5000, $sup, 150],
            ['Coca-Cola 1 л', 'pcs', 96, 24, $sup2, 120000], ['Бира Шуменско кен', 'pcs', 144, 24, $sup2, 90000], ['Самърсби', 'pcs', 72, 12, $sup2, 150000],
        ] as [$name, $unit, $qty, $min, $s, $cost]) {
            $i = Ingredient::create(['branch_id' => $branch->id, 'supplier_id' => $s->id, 'name' => $name, 'unit' => $unit, 'min_level' => $min, 'reorder_qty' => $min * 2, 'cost_per_unit_millicents' => $cost]);
            $stock->manual($i, 'opening', $qty, 'Начално количество (демо)', null);
            $ing[$name] = $i;
        }

        // ------------------------------------------------------------------ menu (imported from NOAR's public Wolt menu)
        // Source + photos: scripts/import-wolt-menu.py → database/seeders/data/noar-menu.json, database/seeders/photos/*.webp
        // Wolt lists no allergens or nutrition values, so none are invented here.
        $pizza = ['Тесто за пица' => 1, 'Кашкавал' => 120, 'Доматен сос' => 80];
        $recipes = [
            'Бургер телешки' => ['Телешка кайма' => 180, 'Хлебче за бургер' => 1, 'Чедър' => 30, 'Картофи' => 150],
            'Бургер пилешки' => ['Пилешко филе' => 150, 'Хлебче за бургер' => 1, 'Чедър' => 30, 'Картофи' => 150],
            'Цезар' => ['Пилешко филе' => 100, 'Айсберг' => 120, 'Пармезан' => 20],
            'Ноар' => $pizza, 'Маргарита' => $pizza, 'Прошуто' => $pizza, 'Капричоза' => $pizza, 'Поло' => $pizza, 'BBQ Пица' => $pizza,
            'Четири сирена' => $pizza, 'Пеперони' => $pizza, 'Детска пица' => $pizza, 'Пица Карбонара' => $pizza,
            'Филе от Сьомга' => ['Филе сьомга' => 220],
            'Телешки бон филенца' => ['Телешко филе' => 200],
            'Пържени картофи 0,300 г' => ['Картофи' => 300],
            'Coca-Cola Original Taste 1л' => ['Coca-Cola 1 л' => 1],
            'Бира Шуменско кен' => ['Бира Шуменско кен' => 1],
            'Самърсби' => ['Самърсби' => 1],
        ];
        $stationArt = ['hot' => ['steak', '#8a4b2a'], 'cold' => ['salad', '#7fa34a'], 'bar' => ['soda', '#3a1410'], 'dessert' => ['dessert', '#5a3e2b']];
        $data = json_decode(file_get_contents(database_path('seeders/data/noar-menu.json')), true);
        $photoDir = database_path('seeders/photos');
        $productsByName = [];
        foreach ($data['categories'] as $ci => $c) {
            $category = Category::create(['branch_id' => $branch->id, 'name' => $c['name'], 'slug' => $c['slug'], 'sort' => $ci]);
            foreach ($c['products'] as $pi => $row) {
                $imageUrl = $row['photo'] && is_file("{$photoDir}/{$row['photo']}") ? config('noar.photo_base').$row['photo'] : null;
                [$style, $base] = $stationArt[$c['station']] ?? $stationArt['hot'];
                $p = Product::create([
                    'branch_id' => $branch->id, 'category_id' => $category->id, 'station_id' => $stations[$c['station']]->id,
                    'name' => $row['name'], 'description' => $row['description'] ?: null, 'portion' => $row['portion'],
                    'price_cents' => $row['price_cents'], 'vat_rate_bps' => $row['vat_rate_bps'], 'image_url' => $imageUrl,
                    'allergens' => [], 'art' => ['style' => $style, 'base' => $base, 'accents' => ['#e8d9a8', '#c9a24a', '#f5f0e1']],
                    'nutrition' => null, 'sort' => $pi,
                ]);
                foreach ($recipes[$row['name']] ?? [] as $ingName => $qty) {
                    RecipeItem::create(['product_id' => $p->id, 'ingredient_id' => $ing[$ingName]->id, 'quantity' => $qty]);
                }
                $productsByName[$row['name']] = $p->load('modifierGroups.options');
            }
        }

        // ------------------------------------------------------------------ history (real flows, backdated)
        if (config('noar.seed_history')) {
            $this->seedHistory($branch, $productsByName, $waiter, $cashier);
        }

        // Real dish photos dropped into storage/app/demo-photos are attached automatically.
        if (is_dir(storage_path('app/demo-photos'))) {
            \Illuminate\Support\Facades\Artisan::call('noar:import-photos', ['dir' => storage_path('app/demo-photos')]);
        }

        // ------------------------------------------------------------------ second tenant (isolation tests)
        $org2 = Organization::create(['name' => 'Демо Бистро ЕООД', 'slug' => 'demo-bistro', 'status' => 'active']);
        $b2 = app(BranchProvisioner::class)->createBranch($org2, 'Бистро Пловдив');
        $b2->update(['onboarding_completed_at' => now(), 'city' => 'Пловдив']);
        $u2 = User::create(['name' => 'Собственик Бистро', 'email' => 'owner@bistro.local', 'password' => $password]);
        Membership::create(['user_id' => $u2->id, 'organization_id' => $org2->id, 'branch_id' => null, 'role' => 'owner']);
        BranchProvisioner::newTable($b2, ['floor_area_id' => $b2->areas()->first()->id, 'number' => 1, 'label' => 'Маса 01', 'x' => 100, 'y' => 100]);
    }

    private function seedHistory(Branch $branch, array $products, User $waiter, User $cashier): void
    {
        $orders = app(OrderService::class);
        $payments = app(PaymentService::class);
        $tables = $branch->tables()->orderBy('number')->get();
        mt_srand(2026);
        $pick = function () use ($products) {
            $all = array_values($products);
            $lines = [];
            $count = mt_rand(2, 5);
            for ($i = 0; $i < $count; $i++) {
                $p = $all[mt_rand(0, count($all) - 1)];
                $mods = [];
                foreach ($p->modifierGroups as $g) {
                    if ($g->min_select > 0) {
                        $mods[] = $g->options[mt_rand(0, $g->options->count() - 1)]->id;
                    }
                }
                $lines[] = ['product_id' => $p->id, 'quantity' => mt_rand(1, 2), 'modifier_ids' => $mods];
            }
            return $lines;
        };

        $today = Carbon::now($branch->timezone)->startOfDay(); // captured before time is mocked
        for ($day = 6; $day >= 1; $day--) {
            $base = $today->copy()->subDays($day)->setTime(12, 0);
            Carbon::setTestNow($base->copy()->subMinutes(5)->utc());
            $shift = PosShift::create(['branch_id' => $branch->id, 'opened_by' => $cashier->id, 'opening_float_cents' => 20000, 'opened_at' => now(), 'status' => 'open']);
            $sessions = mt_rand(5, 9);
            for ($s = 0; $s < $sessions; $s++) {
                Carbon::setTestNow($base->copy()->addMinutes(40 * $s + mt_rand(0, 30))->utc());
                $table = $tables[mt_rand(0, $tables->count() - 1)];
                if ($orders->activeSession($table)) {
                    continue;
                }
                $session = $orders->openSession($table, $waiter);
                $order = $orders->placeStaffOrder($session, $pick(), null, $waiter);
                Carbon::setTestNow(now()->addMinutes(mt_rand(8, 22)));
                foreach ($order->items()->with('prepItem')->get() as $item) {
                    $orders->setPrepStatus($item->prepItem, 'ready', $waiter);
                }
                $orders->serve($order->fresh(), null, $waiter);
                Carbon::setTestNow(now()->addMinutes(mt_rand(25, 60)));
                foreach (Check::where('table_session_id', $session->id)->where('status', 'open')->get() as $check) {
                    $payments->pay($check, ['method' => mt_rand(0, 2) ? 'card' : 'cash', 'mode' => 'full', 'tip_cents' => mt_rand(0, 3) * 100], $cashier);
                }
                $orders->clearTable($session, $waiter);
            }
            Carbon::setTestNow($base->copy()->addHours(11)->utc());
            $shift->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => $cashier->id]);
        }
        Carbon::setTestNow();
    }
}
