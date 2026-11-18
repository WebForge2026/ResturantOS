<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class PurchaseReceipt extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'received_at' => 'datetime',
        ];
    }

    public function items(): HasMany { return $this->hasMany(PurchaseReceiptItem::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
}
