<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ModifierOption extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_available' => 'boolean',
        ];
    }

    public function group(): BelongsTo { return $this->belongsTo(ModifierGroup::class, 'modifier_group_id'); }
}
