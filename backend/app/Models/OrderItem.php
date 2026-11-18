<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class OrderItem extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'modifiers' => 'array',
            'served_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class)->withTrashed(); }
    public function station(): BelongsTo { return $this->belongsTo(Station::class); }
    public function prepItem(): HasOne { return $this->hasOne(PrepItem::class); }
    public function checkItem(): HasOne { return $this->hasOne(CheckItem::class); }
}
