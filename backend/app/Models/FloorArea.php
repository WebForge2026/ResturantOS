<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class FloorArea extends Model
{
    protected $guarded = ['id'];

    public function tables(): HasMany { return $this->hasMany(DiningTable::class); }
    public function branch(): BelongsTo { return $this->belongsTo(Branch::class); }
}
