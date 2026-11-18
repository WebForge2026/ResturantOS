<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class PrepItem extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ready_at' => 'datetime',
            'handed_off_at' => 'datetime',
        ];
    }

    public function ticket(): BelongsTo { return $this->belongsTo(PrepTicket::class, 'prep_ticket_id'); }
    public function orderItem(): BelongsTo { return $this->belongsTo(OrderItem::class); }
}
