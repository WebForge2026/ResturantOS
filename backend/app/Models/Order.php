<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    public const STATUSES = ['pending', 'accepted', 'in_preparation', 'partially_ready', 'ready', 'served', 'completed', 'cancelled'];

    /** Explicit transition table. Aggregate statuses are derived from prep items but must follow it. */
    public const TRANSITIONS = [
        'pending' => ['accepted', 'cancelled'],
        'accepted' => ['in_preparation', 'partially_ready', 'ready', 'served', 'cancelled'],
        'in_preparation' => ['accepted', 'partially_ready', 'ready', 'served', 'cancelled'],
        'partially_ready' => ['accepted', 'in_preparation', 'ready', 'served', 'cancelled'],
        'ready' => ['accepted', 'in_preparation', 'partially_ready', 'served', 'cancelled'],
        'served' => ['completed', 'partially_ready', 'ready'],
        'completed' => [],
        'cancelled' => [],
    ];

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'accepted_at' => 'datetime',
            'ready_at' => 'datetime',
            'served_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function canTransitionTo(string $to): bool
    {
        return $this->status === $to || in_array($to, self::TRANSITIONS[$this->status] ?? [], true);
    }

    public function branch(): BelongsTo { return $this->belongsTo(Branch::class); }
    public function session(): BelongsTo { return $this->belongsTo(TableSession::class, 'table_session_id'); }
    public function table(): BelongsTo { return $this->belongsTo(DiningTable::class, 'dining_table_id'); }
    public function items(): HasMany { return $this->hasMany(OrderItem::class); }
    public function tickets(): HasMany { return $this->hasMany(PrepTicket::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
