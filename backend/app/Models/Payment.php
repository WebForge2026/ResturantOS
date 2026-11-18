<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Payment extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_simulated' => 'boolean',
        ];
    }

    public function check(): BelongsTo { return $this->belongsTo(Check::class); }
    public function allocations(): HasMany { return $this->hasMany(PaymentAllocation::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
