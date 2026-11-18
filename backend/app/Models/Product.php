<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'allergens' => 'array',
            'art' => 'array',
            'nutrition' => 'array',
            'is_available' => 'boolean',
            'is_published' => 'boolean',
            'auto_unavailable_on_low_stock' => 'boolean',
        ];
    }

    public function branch(): BelongsTo { return $this->belongsTo(Branch::class); }
    public function category(): BelongsTo { return $this->belongsTo(Category::class); }
    public function station(): BelongsTo { return $this->belongsTo(Station::class); }
    public function modifierGroups(): HasMany { return $this->hasMany(ModifierGroup::class)->orderBy('sort'); }
    public function recipeItems(): HasMany { return $this->hasMany(RecipeItem::class); }
}
