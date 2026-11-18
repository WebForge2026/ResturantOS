<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DiningTable extends Model
{
    protected $guarded = ['id'];
    protected $hidden = ['qr_token'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'qr_rotated_at' => 'datetime',
        ];
    }

    public function branch(): BelongsTo { return $this->belongsTo(Branch::class); }
    public function area(): BelongsTo { return $this->belongsTo(FloorArea::class, 'floor_area_id'); }
    public function sessions(): HasMany { return $this->hasMany(TableSession::class); }
    public function openSession(): HasOne { return $this->hasOne(TableSession::class)->whereIn('status', TableSession::ACTIVE_STATUSES)->latestOfMany(); }
}
