<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    protected $guarded = ['id'];

    public const DEFAULT_SETTINGS = [
        'order_accept_mode' => 'auto', // auto|manual
        'show_bgn' => true,
        'service_charge_bps' => 0,
        'tips_enabled' => true,
        'require_shift_for_payments' => false,
        'stock_reservation_enabled' => true,
        'brand_accent' => '#ff2a2a',
    ];

    protected function casts(): array
    {
        return [
            'opening_hours' => 'array',
            'settings' => 'array',
            'onboarding' => 'array',
            'onboarding_completed_at' => 'datetime',
        ];
    }

    public function setting(string $key): mixed
    {
        return ($this->settings ?? [])[$key] ?? self::DEFAULT_SETTINGS[$key] ?? null;
    }

    public function resolvedSettings(): array
    {
        return array_merge(self::DEFAULT_SETTINGS, $this->settings ?? []);
    }

    public function organization(): BelongsTo { return $this->belongsTo(Organization::class); }
    public function areas(): HasMany { return $this->hasMany(FloorArea::class)->orderBy('sort'); }
    public function tables(): HasMany { return $this->hasMany(DiningTable::class); }
    public function stations(): HasMany { return $this->hasMany(Station::class)->orderBy('sort'); }
    public function categories(): HasMany { return $this->hasMany(Category::class)->orderBy('sort'); }
    public function products(): HasMany { return $this->hasMany(Product::class); }
    public function sessions(): HasMany { return $this->hasMany(TableSession::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function prepTickets(): HasMany { return $this->hasMany(PrepTicket::class); }
    public function checks(): HasMany { return $this->hasMany(Check::class); }
    public function payments(): HasMany { return $this->hasMany(Payment::class); }
    public function shifts(): HasMany { return $this->hasMany(PosShift::class); }
    public function serviceRequests(): HasMany { return $this->hasMany(ServiceRequest::class); }
    public function ingredients(): HasMany { return $this->hasMany(Ingredient::class); }
    public function suppliers(): HasMany { return $this->hasMany(Supplier::class); }
    public function memberships(): HasMany { return $this->hasMany(Membership::class); }
}
