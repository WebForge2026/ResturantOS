<?php

namespace App\Console\Commands;

use App\Models\Branch;
use App\Models\Product;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Bulk-attach real dish photos: put files named after the product (see --list) into a folder
 * and run `php artisan noar:import-photos /path/to/folder`. Top-down, square photos look best on the table.
 */
class ImportPhotos extends Command
{
    protected $signature = 'noar:import-photos {dir? : Folder with .jpg/.png/.webp files} {--branch=noar-sofia} {--list : Print the expected file names}';

    protected $description = 'Attach real dish photos to products by file name';

    public function handle(): int
    {
        $branch = Branch::where('slug', $this->option('branch'))->firstOrFail();
        $products = Product::where('branch_id', $branch->id)->get();
        $slug = fn (Product $p) => Str::slug(Str::transliterate($p->name));

        if ($this->option('list') || ! $this->argument('dir')) {
            $this->table(['Продукт', 'Име на файла'], $products->map(fn ($p) => [$p->name, $slug($p).'.jpg'])->all());
            return self::SUCCESS;
        }
        $dir = rtrim($this->argument('dir'), '/');
        $count = 0;
        foreach ($products as $p) {
            foreach (['jpg', 'jpeg', 'png', 'webp'] as $ext) {
                $file = "{$dir}/{$slug($p)}.{$ext}";
                if (! is_file($file)) {
                    continue;
                }
                $path = "products/{$branch->id}/{$slug($p)}.{$ext}";
                Storage::disk('public')->put($path, file_get_contents($file));
                $p->update(['image_url' => '/storage/'.$path]);
                $this->line("✓ {$p->name}");
                $count++;
                break;
            }
        }
        $this->info("Импортирани снимки: {$count}/{$products->count()}");
        return self::SUCCESS;
    }
}
