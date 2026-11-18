<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Organization extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'feature_flags' => 'array',
        ];
    }

    public function branches(): HasMany { return $this->hasMany(Branch::class); }
    public function memberships(): HasMany { return $this->hasMany(Membership::class); }
}
