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
 * Menu items, prices and nutrition values are ILLUSTRATIVE examples, not NOAR's verified menu.
 * Nutrition values are rough estimates and flagged as such.
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
            ['Телешка кайма', 'g', 16000, 2000, $sup, 1800], ['Бриош хлебче', 'pcs', 140, 20, $sup, 45000], ['Чедър', 'g', 3000, 600, $sup, 2200],
            ['Пилешко филе', 'g', 6000, 1500, $sup, 1100], ['Салата романа', 'g', 4000, 800, $sup, 600], ['Пармезан', 'g', 2000, 400, $sup, 3500],
            ['Филе сьомга', 'g', 7000, 1200, $sup, 3800], ['Тесто за пица', 'pcs', 140, 12, $sup, 40000], ['Моцарела', 'g', 16000, 1200, $sup, 1400],
            ['Доматен сос', 'g', 5000, 1000, $sup, 500], ['Кока-Кола 330 мл', 'pcs', 144, 24, $sup2, 60000], ['Джин', 'ml', 3000, 700, $sup2, 3200],
            ['Кампари', 'ml', 2000, 700, $sup2, 3000], ['Червен вермут', 'ml', 2000, 700, $sup2, 2000], ['Водка', 'ml', 3000, 700, $sup2, 2500],
            ['Еспресо (доза)', 'pcs', 400, 80, $sup2, 30000], ['Лимони', 'pcs', 40, 15, $sup, 25000], ['Рибай', 'g', 9000, 1500, $sup, 6500],
        ] as [$name, $unit, $qty, $min, $s, $cost]) {
            $i = Ingredient::create(['branch_id' => $branch->id, 'supplier_id' => $s->id, 'name' => $name, 'unit' => $unit, 'min_level' => $min, 'reorder_qty' => $min * 2, 'cost_per_unit_millicents' => $cost]);
            $stock->manual($i, 'opening', $qty, 'Начално количество (демо)', null);
            $ing[$name] = $i;
        }

        // ------------------------------------------------------------------ menu
        $cat = fn (string $name, string $slug, int $sort) => Category::create(['branch_id' => $branch->id, 'name' => $name, 'slug' => $slug, 'sort' => $sort]);
        $cats = [
            'salads' => $cat('Салати', 'salati', 0),
            'mains' => $cat('Основни ястия', 'osnovni', 1),
            'fish' => $cat('Риба и морски дарове', 'riba', 2),
            'pizza' => $cat('Пица', 'pica', 3),
            'drinks' => $cat('Напитки и коктейли', 'napitki', 4),
        ];
        $n = fn ($kcal, $p, $f, $c) => ['kcal' => $kcal, 'protein' => $p, 'fat' => $f, 'carbs' => $c, 'is_estimate' => true];

        $menu = [
            ['salads', 'cold', 'Цезар с пушено пиле', 1290, '320 г', 'Хрупкава романа, пушено пилешко филе, крутони с масло, пармезан и класически дресинг „Цезар“.', 'романа, пилешко филе, пармезан, крутони, яйце, аншоа, лимон', ['глутен', 'яйца', 'мляко', 'риба'], ['salad', '#7fa34a', ['#e8d9a8', '#c9a24a', '#f5f0e1']], $n(520, 34, 32, 22), [['Добавки', 'modifier', 0, 2, [['Допълнително пиле', 300], ['Пармезан', 150]]]], ['Пилешко филе' => 100, 'Салата романа' => 120, 'Пармезан' => 20]],
            ['salads', 'cold', 'Бурата с печени домати', 1350, '280 г', 'Кремообразна бурата, печени чери домати, песто от босилек и хрупкав хляб на жар.', 'бурата, чери домати, босилек, зехтин, хляб', ['мляко', 'глутен', 'ядки'], ['salad', '#93b75b', ['#e23d2d', '#f4f1ea', '#3e7a2e']], $n(430, 18, 31, 20), [], []],
            ['salads', 'cold', 'Шопска NOAR', 890, '350 г', 'Домати, краставици, печени чушки, червен лук и настъргано овче сирене.', 'домати, краставици, чушки, лук, сирене', ['мляко'], ['salad', '#c94a3a', ['#e23d2d', '#7bb661', '#f4f1ea']], $n(310, 12, 22, 14), [], []],
            ['salads', 'cold', 'Тай салата с говеждо', 1420, '300 г', 'Тънко нарязано говеждо, манго, кориандър, лайм, чили и печени фъстъци.', 'говеждо, манго, кориандър, лайм, чили, фъстъци', ['фъстъци', 'соя'], ['salad', '#6c9a3c', ['#f2a33a', '#8b2e2e', '#f6e7b4']], $n(390, 28, 18, 26), [], []],

            ['mains', 'hot', 'NOAR Смаш бургер', 1590, '380 г', 'Две смачкани телешки кюфтенца, чедър, карамелизиран лук, NOAR сос в бриош хлебче. С картофки.', 'телешка кайма, чедър, бриош, лук, сос, картофи', ['глутен', 'мляко', 'горчица', 'яйца'], ['burger', '#8a4b2a', ['#f2c14e', '#e8b04a', '#f5e6c4']], $n(980, 48, 56, 68), [['Изпичане', 'variant', 1, 1, [['Средно', 0], ['Добре изпечено', 0]]], ['Добавки', 'modifier', 0, 3, [['Бекон', 200], ['Допълнителен чедър', 150], ['Без лук', 0]]]], ['Телешка кайма' => 180, 'Бриош хлебче' => 1, 'Чедър' => 30]],
            ['mains', 'hot', 'Рибай стек 300 г', 3400, '300 г / 150 г гарнитура', 'Зрял рибай на жар, димно масло с розмарин и печени бейби картофи.', 'рибай, масло, розмарин, картофи', ['мляко'], ['steak', '#7a2e22', ['#e8b04a', '#3e7a2e', '#f5f0e1']], $n(1050, 68, 78, 24), [['Изпичане', 'variant', 1, 1, [['Алангле', 0], ['Медиум рейр', 0], ['Медиум', 0], ['Добре изпечено', 0]]]], ['Рибай' => 300]],
            ['mains', 'hot', 'Пиле сатай с жасминов ориз', 1640, '360 г', 'Шишчета от пилешко бутче в сатай сос с фъстъци, жасминов ориз и пикантни краставички.', 'пилешко месо, фъстъчен сос, ориз, краставица', ['фъстъци', 'соя'], ['steak', '#b9772f', ['#f2d16b', '#7bb661', '#f5f0e1']], $n(760, 44, 30, 78), [], ['Пилешко филе' => 200]],
            ['mains', 'hot', 'Трюфелово ризото', 1890, '320 г', 'Ризото „Карнароли“ с горски гъби, масло от черен трюфел и отлежал пармезан.', 'ориз карнароли, гъби, трюфелово масло, пармезан', ['мляко'], ['pasta', '#d8c08a', ['#5a3e2b', '#f5f0e1', '#3e7a2e']], $n(690, 18, 32, 82), [], ['Пармезан' => 25]],

            ['fish', 'hot', 'Сьомга на жар', 2450, '220 г / 150 г', 'Филе от норвежка сьомга на жар, сос бьор блан, аспержи и лимон.', 'сьомга, аспержи, масло, лимон', ['риба', 'мляко'], ['fish', '#f08a5d', ['#f2d16b', '#7bb661', '#3e7a2e']], $n(620, 46, 42, 8), [], ['Филе сьомга' => 220]],
            ['fish', 'hot', 'Тигрови скариди в чесново масло', 2290, '250 г', 'Тигрови скариди, чесново масло с чили, магданоз и препечена чабата.', 'скариди, чесън, масло, чили, магданоз, хляб', ['ракообразни', 'мляко', 'глутен'], ['shrimp', '#f28a5b', ['#f2d16b', '#7bb661', '#f5f0e1']], $n(540, 36, 30, 28), [], []],
            ['fish', 'hot', 'Лаврак с лимонов бьор блан', 2380, '300 г', 'Филе от лаврак с хрупкава кожа, лимонов бьор блан и задушен спанак.', 'лаврак, масло, лимон, спанак', ['риба', 'мляко'], ['fish', '#e9e1d2', ['#f2d16b', '#3e7a2e', '#c9a24a']], $n(480, 40, 28, 6), [], []],
            ['fish', 'hot', 'Калмари панко', 1560, '250 г', 'Хрупкави калмари в панко, айоли с лайм и пушен червен пипер.', 'калмари, панко, айоли, лайм', ['мекотели', 'глутен', 'яйца'], ['shrimp', '#e8c27a', ['#7bb661', '#f5f0e1', '#e23d2d']], $n(610, 30, 34, 44), [], []],

            ['pizza', 'hot', 'Маргарита Наполетана', 1190, '32 см', 'Тесто с 48-часова ферментация, сос от домати Сан Марцано, моцарела фиор ди лате и босилек.', 'тесто, доматен сос, моцарела, босилек', ['глутен', 'мляко'], ['pizza', '#d6452f', ['#3e7a2e', '#f6efe0', '#3e7a2e']], $n(820, 34, 28, 108), [['Размер', 'variant', 1, 1, [['32 см', 0], ['40 см', 450]]]], ['Тесто за пица' => 1, 'Моцарела' => 120, 'Доматен сос' => 80]],
            ['pizza', 'hot', 'Диавола', 1390, '32 см', 'Пикантен салам вентричина, моцарела, люто масло с чили и мед.', 'тесто, доматен сос, моцарела, вентричина, чили, мед', ['глутен', 'мляко'], ['pizza', '#c93a26', ['#8b1a1a', '#f6efe0', '#e8b04a']], $n(940, 40, 38, 104), [['Размер', 'variant', 1, 1, [['32 см', 0], ['40 см', 450]]]], ['Тесто за пица' => 1, 'Моцарела' => 120, 'Доматен сос' => 80]],
            ['pizza', 'hot', 'Трюфел & Прошуто', 1690, '32 см', 'Бяла основа с крем от трюфел, моцарела, прошуто крудо и рукола.', 'тесто, крем от трюфел, моцарела, прошуто, рукола', ['глутен', 'мляко'], ['pizza', '#efe3c4', ['#c96b6b', '#3e7a2e', '#5a3e2b']], $n(980, 42, 44, 98), [], ['Тесто за пица' => 1, 'Моцарела' => 100]],
            ['pizza', 'hot', 'Четири сирена', 1450, '32 см', 'Моцарела, горгонзола, пармезан и пушено сирене скаморца.', 'тесто, моцарела, горгонзола, пармезан, скаморца', ['глутен', 'мляко'], ['pizza', '#f1d48a', ['#f6efe0', '#c9a24a', '#e8d9a8']], $n(1020, 46, 50, 96), [], ['Тесто за пица' => 1, 'Моцарела' => 100, 'Пармезан' => 20]],

            ['drinks', 'bar', 'Кока-Кола 330 мл', 350, '330 мл', 'Охладена, с лед и резен лимон.', 'безалкохолна напитка', [], ['soda', '#3a1410', ['#f2d16b', '#ffffff', '#ffffff']], $n(139, 0, 0, 35), [['Вариант', 'variant', 1, 1, [['Класик', 0], ['Зеро', 0]]]], ['Кока-Кола 330 мл' => 1]],
            ['drinks', 'bar', 'Crimson Negroni', 1200, '90 мл', 'Джин, Кампари и червен вермут, бавно разбъркани върху голям кристален лед, портокалова кора.', 'джин, кампари, червен вермут, портокал', ['алкохол'], ['cocktail', '#b3121f', ['#f28c28', '#ff2a2a', '#ffffff']], $n(200, 0, 0, 14), [], ['Джин' => 30, 'Кампари' => 30, 'Червен вермут' => 30]],
            ['drinks', 'bar', 'NOAR Espresso Martini', 1250, '120 мл', 'Водка, прясно еспресо и кафе ликьор, разклатени до кадифена пяна.', 'водка, еспресо, кафе ликьор', ['алкохол'], ['cocktail', '#2b1a12', ['#c9a27a', '#f5e6c4', '#ffffff']], $n(230, 0, 0, 18), [], ['Водка' => 40, 'Еспресо (доза)' => 1]],
            ['drinks', 'bar', 'Домашна лимонада', 550, '400 мл', 'Лимони, мента, тръстикова захар и газирана вода.', 'лимон, мента, захар, вода', [], ['soda', '#e8d75a', ['#f2d16b', '#3e7a2e', '#ffffff']], $n(160, 0, 0, 40), [['Вкус', 'variant', 1, 1, [['Класическа', 0], ['Малина', 50], ['Маракуя', 50]]]], ['Лимони' => 1]],
        ];

        $productsByName = [];
        foreach ($menu as $sort => [$c, $station, $name, $price, $portion, $desc, $ingredients, $allergens, $art, $nutrition, $groups, $recipe]) {
            $p = Product::create([
                'branch_id' => $branch->id, 'category_id' => $cats[$c]->id, 'station_id' => $stations[$station]->id,
                'name' => $name, 'price_cents' => $price, 'portion' => $portion, 'description' => $desc, 'ingredients' => $ingredients,
                'allergens' => $allergens, 'art' => ['style' => $art[0], 'base' => $art[1], 'accents' => $art[2]], 'nutrition' => $nutrition,
                'sort' => $sort, 'vat_rate_bps' => 2000,
            ]);
            foreach ($groups as $gi => [$gname, $kind, $min, $max, $opts]) {
                $g = ModifierGroup::create(['product_id' => $p->id, 'name' => $gname, 'kind' => $kind, 'min_select' => $min, 'max_select' => $max, 'sort' => $gi]);
                foreach ($opts as $oi => [$oname, $delta]) {
                    ModifierOption::create(['modifier_group_id' => $g->id, 'name' => $oname, 'price_delta_cents' => $delta, 'sort' => $oi]);
                }
            }
            foreach ($recipe as $ingName => $qty) {
                RecipeItem::create(['product_id' => $p->id, 'ingredient_id' => $ing[$ingName]->id, 'quantity' => $qty]);
            }
            $productsByName[$name] = $p->load('modifierGroups.options');
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
