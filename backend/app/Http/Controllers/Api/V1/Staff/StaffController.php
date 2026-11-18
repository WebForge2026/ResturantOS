<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\User;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StaffController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $members = Membership::where('organization_id', $branch->organization_id)
            ->where(fn ($q) => $q->whereNull('branch_id')->orWhere('branch_id', $branch->id))
            ->with('user')->get();
        return response()->json([
            'roles' => collect(Permissions::ROLES)->map(fn ($label, $key) => ['key' => $key, 'label' => $label, 'permissions' => Permissions::forRole($key)])->values(),
            'data' => $members->map(fn (Membership $m) => [
                'membership_id' => $m->id,
                'user_id' => $m->user->id,
                'name' => $m->user->name,
                'email' => $m->user->email,
                'role' => $m->role,
                'role_label' => Permissions::ROLES[$m->role] ?? $m->role,
                'scope' => $m->branch_id ? 'branch' : 'organization',
                'is_active' => $m->user->is_active,
                'has_pin' => $m->user->pin_hash !== null,
                'last_login_at' => $m->user->last_login_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    /** Creates an employee with either a manager-set password or a one-time setup code (local: shown once). */
    public function store(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190'],
            'role' => ['required', Rule::in(array_keys(Permissions::ROLES))],
            'password' => ['nullable', Password::min(10)],
            'pin' => ['nullable', 'digits_between:4,8'],
        ]);
        $actorRole = $request->user()->membershipFor($branch)->role;
        if ($data['role'] === 'owner' && $actorRole !== 'owner') {
            throw new DomainError('forbidden_role', 'Само собственик може да добавя собственици.', 403);
        }
        $temp = null;
        $user = DB::transaction(function () use ($branch, $data, &$temp) {
            $user = User::where('email', Str::lower($data['email']))->first();
            if (! $user) {
                $temp = empty($data['password']) ? Str::password(14, symbols: false) : null;
                $user = User::create(['name' => $data['name'], 'email' => Str::lower($data['email']), 'password' => $data['password'] ?? $temp]);
            }
            if (Membership::where('user_id', $user->id)->where('organization_id', $branch->organization_id)->exists()) {
                throw new DomainError('already_member', 'Служителят вече е добавен.', 409);
            }
            if (! empty($data['pin'])) {
                $user->forceFill(['pin_hash' => Hash::make($data['pin'])])->save();
            }
            Membership::create(['user_id' => $user->id, 'organization_id' => $branch->organization_id, 'branch_id' => $branch->id, 'role' => $data['role']]);
            return $user;
        });
        Audit::record($branch, 'staff.created', $user, ['role' => $data['role']]);
        return response()->json([
            'user_id' => $user->id,
            // Shown once so the manager can hand it over; never stored in plain text.
            'temporary_password' => $temp,
        ], 201);
    }

    public function update(Request $request, int $membershipId): JsonResponse
    {
        $branch = $this->branch($request);
        $m = Membership::with('user')->find($membershipId);
        if (! $m || (int) $m->organization_id !== (int) $branch->organization_id || ($m->branch_id && (int) $m->branch_id !== (int) $branch->id)) {
            abort(404);
        }
        $data = $request->validate([
            'role' => ['sometimes', Rule::in(array_keys(Permissions::ROLES))],
            'is_active' => ['sometimes', 'boolean'],
            'pin' => ['nullable', 'digits_between:4,8'],
        ]);
        if ($m->user_id === $request->user()->id && (isset($data['role']) || ($data['is_active'] ?? true) === false)) {
            throw new DomainError('self_change', 'Не можете да промените собствената си роля или да се деактивирате.', 409);
        }
        if ((($data['role'] ?? null) === 'owner' || $m->role === 'owner') && $request->user()->membershipFor($branch)->role !== 'owner') {
            throw new DomainError('forbidden_role', 'Само собственик може да променя собственици.', 403);
        }
        if (isset($data['role'])) {
            $m->update(['role' => $data['role']]);
        }
        if (array_key_exists('is_active', $data)) {
            $m->user->forceFill(['is_active' => $data['is_active']])->save();
            if (! $data['is_active']) {
                $m->user->tokens()->delete();
            }
        }
        if (! empty($data['pin'])) {
            $m->user->forceFill(['pin_hash' => Hash::make($data['pin'])])->save();
        }
        Audit::record($branch, 'staff.updated', $m->user, collect($data)->except('pin')->all());
        return response()->json(['ok' => true]);
    }
}
