<?php

namespace App\Models;

use App\Support\Permissions;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password', 'is_active'];

    protected $hidden = ['password', 'remember_token', 'pin_hash'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_platform_admin' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(Membership::class);
    }

    /** Membership granting access to the branch (branch-specific or organization-wide). */
    public function membershipFor(Branch $branch): ?Membership
    {
        return $this->memberships
            ->where('organization_id', $branch->organization_id)
            ->filter(fn (Membership $m) => $m->branch_id === null || $m->branch_id === $branch->id)
            ->sortBy(fn (Membership $m) => $m->branch_id === null ? 1 : 0)
            ->first();
    }

    public function permissionsFor(Branch $branch): array
    {
        $m = $this->membershipFor($branch);
        return $m ? Permissions::forRole($m->role, $m->extra_permissions ?? []) : [];
    }

    public function canInBranch(Branch $branch, string $permission): bool
    {
        return in_array($permission, $this->permissionsFor($branch), true);
    }
}
