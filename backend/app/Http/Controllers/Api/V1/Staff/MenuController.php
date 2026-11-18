<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\ModifierGroup;
use App\Models\ModifierOption;
use App\Models\Product;
use App\Models\Station;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class MenuController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        return response()->json([
            'categories' => $branch->categories()->get(['id', 'name', 'slug', 'sort', 'is_active']),
            'products' => $branch->products()->with(['modifierGroups.options', 'recipeItems'])->orderBy('category_id')->orderBy('sort')->get()
                ->map(fn ($p) => Present::staffProduct($p)),
            'stations' => $branch->stations()->get(['id', 'name', 'code', 'display', 'color']),
        ]);
    }

    public function saveCategory(Request $request, ?int $categoryId = null): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'sort' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ]);
        $cat = $categoryId ? $this->own(Category::find($categoryId), $branch) : new Category(['branch_id' => $branch->id]);
        $slug = Str::slug(Str::transliterate($data['name'])) ?: 'cat';
        if (Category::where('branch_id', $branch->id)->where('slug', $slug)->where('id', '!=', $cat->id)->exists()) {
            $slug .= '-'.Str::lower(Str::random(3));
        }
        $cat->fill(['name' => $data['name'], 'slug' => $cat->exists ? $cat->slug : $slug, 'sort' => $data['sort'] ?? $cat->sort ?? $branch->categories()->count(), 'is_active' => $data['is_active'] ?? true])->save();
        Audit::record($branch, 'category.saved', $cat);
        return response()->json(['category' => $cat]);
    }

    public function deleteCategory(Request $request, int $categoryId): JsonResponse
    {
        $branch = $this->branch($request);
        $cat = $this->own(Category::find($categoryId), $branch);
        if (Product::withTrashed()->where('category_id', $cat->id)->exists()) {
            throw new DomainError('category_not_empty', 'Категорията съдържа продукти. Преместете ги или я деактивирайте.', 409);
        }
        $cat->delete();
        Audit::record($branch, 'category.deleted', $cat);
        return response()->json(['ok' => true]);
    }

    public function saveProduct(Request $request, ?int $productId = null): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'category_id' => ['required', 'integer', Rule::exists('categories', 'id')->where('branch_id', $branch->id)],
            'station_id' => ['nullable', 'integer', Rule::exists('stations', 'id')->where('branch_id', $branch->id)],
            'name' => ['required', 'string', 'max:120'],
            'sku' => ['nullable', 'string', 'max:64'],
            'description' => ['nullable', 'string', 'max:1000'],
            'ingredients' => ['nullable', 'string', 'max:1000'],
            'allergens' => ['nullable', 'array', 'max:14'],
            'allergens.*' => ['string', 'max:40'],
            'price_cents' => ['required', 'integer', 'min:0', 'max:1000000'],
            'vat_rate_bps' => ['nullable', 'integer', 'between:0,3000'],
            'portion' => ['nullable', 'string', 'max:64'],
            'image_url' => ['nullable', 'string', 'max:255', 'regex:/^(https?:\/\/|\/storage\/)/'],
            'nutrition' => ['nullable', 'array'],
            'nutrition.kcal' => ['nullable', 'numeric', 'min:0'],
            'nutrition.protein' => ['nullable', 'numeric', 'min:0'],
            'nutrition.fat' => ['nullable', 'numeric', 'min:0'],
            'nutrition.carbs' => ['nullable', 'numeric', 'min:0'],
            'nutrition.is_estimate' => ['nullable', 'boolean'],
            'art' => ['nullable', 'array'],
            'is_available' => ['boolean'],
            'is_published' => ['boolean'],
            'auto_unavailable_on_low_stock' => ['boolean'],
            'sort' => ['nullable', 'integer'],
            'modifier_groups' => ['array', 'max:10'],
            'modifier_groups.*.name' => ['required', 'string', 'max:60'],
            'modifier_groups.*.kind' => ['required', Rule::in(['variant', 'modifier'])],
            'modifier_groups.*.min' => ['required', 'integer', 'min:0', 'max:10'],
            'modifier_groups.*.max' => ['required', 'integer', 'min:1', 'max:10'],
            'modifier_groups.*.options' => ['required', 'array', 'min:1', 'max:20'],
            'modifier_groups.*.options.*.name' => ['required', 'string', 'max:60'],
            'modifier_groups.*.options.*.price_delta_cents' => ['required', 'integer', 'between:-100000,100000'],
        ]);

        $product = DB::transaction(function () use ($branch, $data, $productId) {
            $product = $productId ? $this->own(Product::find($productId), $branch) : new Product(['branch_id' => $branch->id]);
            $nutrition = isset($data['nutrition']) ? $data['nutrition'] + ['is_estimate' => true] : $product->nutrition;
            $product->fill(collect($data)->except(['modifier_groups', 'nutrition'])->all() + [
                'nutrition' => $nutrition,
                'vat_rate_bps' => $data['vat_rate_bps'] ?? $product->vat_rate_bps ?? 2000,
                'sort' => $data['sort'] ?? $product->sort ?? 0,
            ])->save();

            if (array_key_exists('modifier_groups', $data)) {
                // Options are referenced only by immutable order snapshots, so replacing them is safe.
                $product->modifierGroups()->delete();
                foreach ($data['modifier_groups'] as $gi => $g) {
                    $group = ModifierGroup::create(['product_id' => $product->id, 'name' => $g['name'], 'kind' => $g['kind'], 'min_select' => min($g['min'], $g['max']), 'max_select' => $g['max'], 'sort' => $gi]);
                    foreach ($g['options'] as $oi => $o) {
                        ModifierOption::create(['modifier_group_id' => $group->id, 'name' => $o['name'], 'price_delta_cents' => $o['price_delta_cents'], 'sort' => $oi]);
                    }
                }
            }
            return $product;
        });
        Audit::record($branch, $productId ? 'product.updated' : 'product.created', $product, ['price_cents' => $product->price_cents]);
        return response()->json(['product' => Present::staffProduct($product->load('modifierGroups.options', 'recipeItems'))], $productId ? 200 : 201);
    }

    /** Upload a real dish photo (stored on the public disk, served at /storage/products/…). */
    public function uploadImage(Request $request, int $productId): JsonResponse
    {
        $branch = $this->branch($request);
        $product = $this->own(Product::find($productId), $branch);
        $request->validate(['image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:6144', 'dimensions:min_width=300,min_height=300']]);
        $path = $request->file('image')->store("products/{$branch->id}", 'public');
        $product->update(['image_url' => '/storage/'.$path]);
        Audit::record($branch, 'product.image', $product, ['path' => $path]);
        return response()->json(['product' => Present::staffProduct($product->load('modifierGroups.options', 'recipeItems'))]);
    }

    public function toggleAvailability(Request $request, int $productId): JsonResponse
    {
        $branch = $this->branch($request);
        $product = $this->own(Product::find($productId), $branch);
        $data = $request->validate(['is_available' => ['required', 'boolean']]);
        $product->update($data);
        Audit::record($branch, 'product.availability', $product, $data);
        return response()->json(['product' => Present::staffProduct($product->load('modifierGroups.options'))]);
    }

    public function deleteProduct(Request $request, int $productId): JsonResponse
    {
        $branch = $this->branch($request);
        $product = $this->own(Product::find($productId), $branch);
        $product->delete(); // soft delete keeps history
        Audit::record($branch, 'product.deleted', $product);
        return response()->json(['ok' => true]);
    }

    /**
     * CSV import: name;category;price;station_code;description;allergens(comma-separated)
     * With preview=true nothing is written; returns parsed rows and errors.
     */
    public function import(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate(['csv' => ['required', 'string', 'max:200000'], 'preview' => ['boolean']]);
        $lines = preg_split('/\r\n|\r|\n/', trim($data['csv']));
        $delim = str_contains($lines[0] ?? '', ';') ? ';' : ',';
        $header = array_map(fn ($h) => Str::lower(trim($h)), str_getcsv(array_shift($lines), $delim));
        $stations = $branch->stations()->get()->keyBy('code');
        $rows = [];
        $errors = [];
        foreach ($lines as $n => $line) {
            if (trim($line) === '') {
                continue;
            }
            $cols = array_pad(str_getcsv($line, $delim), count($header), null);
            $r = array_combine($header, array_slice($cols, 0, count($header)));
            $price = str_replace(',', '.', (string) ($r['price'] ?? ''));
            $rowErr = [];
            if (empty($r['name'])) $rowErr[] = 'липсва име';
            if (empty($r['category'])) $rowErr[] = 'липсва категория';
            if (! is_numeric($price) || $price < 0) $rowErr[] = 'невалидна цена';
            if (! empty($r['station_code']) && ! $stations->has($r['station_code'])) $rowErr[] = 'непозната станция';
            $row = [
                'line' => $n + 2,
                'name' => trim((string) ($r['name'] ?? '')),
                'category' => trim((string) ($r['category'] ?? '')),
                'price_cents' => is_numeric($price) ? (int) round($price * 100) : null,
                'station_code' => $r['station_code'] ?? null,
                'description' => $r['description'] ?? null,
                'allergens' => array_values(array_filter(array_map('trim', explode(',', (string) ($r['allergens'] ?? ''))))),
                'errors' => $rowErr,
            ];
            $rows[] = $row;
            if ($rowErr) $errors[] = "Ред {$row['line']}: ".implode(', ', $rowErr);
        }
        if (($data['preview'] ?? true) || $errors) {
            return response()->json(['preview' => true, 'rows' => $rows, 'errors' => $errors]);
        }
        $created = DB::transaction(function () use ($branch, $rows, $stations) {
            $count = 0;
            foreach ($rows as $row) {
                $cat = Category::firstOrCreate(
                    ['branch_id' => $branch->id, 'slug' => Str::slug(Str::transliterate($row['category'])) ?: 'cat'],
                    ['name' => $row['category'], 'sort' => $branch->categories()->count()],
                );
                Product::create([
                    'branch_id' => $branch->id, 'category_id' => $cat->id, 'name' => $row['name'],
                    'price_cents' => $row['price_cents'], 'station_id' => $row['station_code'] ? $stations[$row['station_code']]->id : null,
                    'description' => $row['description'], 'allergens' => $row['allergens'],
                ]);
                $count++;
            }
            return $count;
        });
        Audit::record($branch, 'menu.imported', null, ['count' => $created]);
        return response()->json(['preview' => false, 'created' => $created]);
    }
}
