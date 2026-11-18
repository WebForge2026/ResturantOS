<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Domain\Onboarding\BranchProvisioner;
use App\Http\Controllers\Controller;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device' => ['nullable', 'string', 'max:60'],
        ]);
        $user = User::where('email', Str::lower($data['email']))->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw new DomainError('invalid_credentials', 'Грешен имейл или парола.', 401);
        }
        if (! $user->is_active) {
            throw new DomainError('account_disabled', 'Профилът е деактивиран.', 403);
        }
        $user->forceFill(['last_login_at' => now()])->save();
        $token = $user->createToken($data['device'] ?? 'ops', ['*'], now()->addHours(16))->plainTextToken;
        return response()->json(['token' => $token, 'user' => $this->me($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();
        return response()->json(['ok' => true]);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->me($request->user())]);
    }

    /** Owner self-signup: creates organization, first branch and owner membership, starts onboarding. */
    public function register(Request $request, BranchProvisioner $provisioner): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', Password::min(10)],
            'organization_name' => ['required', 'string', 'max:120'],
            'branch_name' => ['required', 'string', 'max:120'],
        ]);
        $user = DB::transaction(function () use ($data, $provisioner) {
            $user = User::create(['name' => $data['name'], 'email' => Str::lower($data['email']), 'password' => $data['password']]);
            // Local demo: mail driver is "log"; verification link is written to the log.
            // Production must enforce verified emails before granting access.
            $org = Organization::create(['name' => $data['organization_name'], 'slug' => Str::slug($data['organization_name']).'-'.Str::lower(Str::random(5)), 'status' => 'active']);
            $branch = $provisioner->createBranch($org, $data['branch_name']);
            Membership::create(['user_id' => $user->id, 'organization_id' => $org->id, 'branch_id' => null, 'role' => 'owner']);
            Audit::record($branch, 'organization.created', $org, [], $user->id);
            return $user;
        });
        $token = $user->createToken('ops', ['*'], now()->addHours(16))->plainTextToken;
        return response()->json(['token' => $token, 'user' => $this->me($user)], 201);
    }

    /** Trusted-device PIN switch: requires an authenticated session on the device + the user's PIN. */
    public function pinSwitch(Request $request): JsonResponse
    {
        $data = $request->validate(['user_id' => ['required', 'integer'], 'pin' => ['required', 'digits_between:4,8']]);
        $device = $request->user();
        $target = User::find($data['user_id']);
        if (! $target || ! $target->pin_hash || ! Hash::check($data['pin'], $target->pin_hash) || ! $target->is_active) {
            throw new DomainError('invalid_pin', 'Грешен ПИН.', 401);
        }
        $sharedOrg = $device->memberships->pluck('organization_id')->intersect($target->memberships->pluck('organization_id'));
        if ($sharedOrg->isEmpty()) {
            throw new DomainError('invalid_pin', 'Грешен ПИН.', 401);
        }
        $token = $target->createToken('pin-switch', ['*'], now()->addHours(12))->plainTextToken;
        return response()->json(['token' => $token, 'user' => $this->me($target)]);
    }

    private function me(User $user): array
    {
        $user->load('memberships.organization', 'memberships.branch');
        $branches = [];
        foreach ($user->memberships as $m) {
            $list = $m->branch_id ? collect([$m->branch]) : $m->organization->branches;
            foreach ($list as $b) {
                $branches[$b->id] ??= [
                    'id' => $b->id,
                    'name' => $b->name,
                    'organization' => $m->organization->name,
                    'organization_status' => $m->organization->status,
                    'role' => $m->role,
                    'role_label' => Permissions::ROLES[$m->role] ?? $m->role,
                    'permissions' => $user->permissionsFor($b),
                    'onboarding_completed' => $b->onboarding_completed_at !== null,
                ];
            }
        }
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'is_platform_admin' => $user->is_platform_admin,
            'branches' => array_values($branches),
        ];
    }
}
