<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TableSession extends Model
{
    public const ACTIVE_STATUSES = ['open', 'bill_requested', 'settled'];

    protected $guarded = ['id'];
    protected $hidden = ['guest_token'];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'bill_requested_at' => 'datetime',
            'settled_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function isActive(): bool { return in_array($this->status, self::ACTIVE_STATUSES, true); }
    public function acceptsOrders(): bool { return in_array($this->status, ['open', 'bill_requested'], true); }

    public function branch(): BelongsTo { return $this->belongsTo(Branch::class); }
    public function table(): BelongsTo { return $this->belongsTo(DiningTable::class, 'dining_table_id'); }
    public function waiter(): BelongsTo { return $this->belongsTo(User::class, 'waiter_id'); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function checks(): HasMany { return $this->hasMany(Check::class); }
    public function serviceRequests(): HasMany { return $this->hasMany(ServiceRequest::class); }
}
