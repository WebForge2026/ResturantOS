<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ModifierGroup extends Model
{
    protected $guarded = ['id'];

    public function product(): BelongsTo { return $this->belongsTo(Product::class); }
    public function options(): HasMany { return $this->hasMany(ModifierOption::class)->orderBy('sort'); }
}
