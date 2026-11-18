<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class CheckItem extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'voided_at' => 'datetime',
        ];
    }

    public function check(): BelongsTo { return $this->belongsTo(Check::class); }
    public function orderItem(): BelongsTo { return $this->belongsTo(OrderItem::class); }
    public function allocations(): HasMany { return $this->hasMany(PaymentAllocation::class); }
}
