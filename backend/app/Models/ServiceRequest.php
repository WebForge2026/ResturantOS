<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ServiceRequest extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'acknowledged_at' => 'datetime',
            'done_at' => 'datetime',
        ];
    }

    public function session(): BelongsTo { return $this->belongsTo(TableSession::class, 'table_session_id'); }
    public function table(): BelongsTo { return $this->belongsTo(DiningTable::class, 'dining_table_id'); }
}
