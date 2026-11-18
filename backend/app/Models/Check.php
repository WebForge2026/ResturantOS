<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Check extends Model
{
    protected $table = 'checks';
    protected $guarded = ['id'];

    protected $attributes = [
        'status' => 'open', 'subtotal_cents' => 0, 'discount_cents' => 0, 'service_charge_cents' => 0,
        'total_cents' => 0, 'paid_cents' => 0, 'tip_cents' => 0, 'version' => 0, 'seq' => 1,
    ];

    protected function casts(): array
    {
        return ['settled_at' => 'datetime'];
    }

    public function dueCents(): int
    {
        return max(0, $this->total_cents - $this->paid_cents);
    }

    public function session(): BelongsTo { return $this->belongsTo(TableSession::class, 'table_session_id'); }
    public function items(): HasMany { return $this->hasMany(CheckItem::class); }
    public function activeItems(): HasMany { return $this->hasMany(CheckItem::class)->whereNull('voided_at'); }
    public function payments(): HasMany { return $this->hasMany(Payment::class); }
}
