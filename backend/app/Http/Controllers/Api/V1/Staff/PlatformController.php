<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Organization;
use App\Models\Payment;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Platform super-admin. Subscription billing is an extension point only (not implemented). */
class PlatformController extends Controller
{
    public const FLAGS = ['qr_ordering', 'inventory', 'split_checks', 'advanced_reports', 'marketing'];

    private function guard(Request $request): void
    {
        abort_unless($request->user()?->is_platform_admin, 403);
    }

    public function organizations(Request $request): JsonResponse
    {
        $this->guard($request);
        $orgs = Organization::withCount('memberships')->with('branches:id,organization_id,name,city,onboarding_completed_at')->orderBy('name')->get();
        return response()->json([
            'flags' => self::FLAGS,
            'data' => $orgs->map(fn ($o) => [
                'id' => $o->id, 'name' => $o->name, 'slug' => $o->slug, 'status' => $o->status,
                'feature_flags' => array_merge(array_fill_keys(self::FLAGS, true), $o->feature_flags ?? []),
                'members' => $o->memberships_count,
                'branches' => $o->branches->map(fn ($b) => [
                    'id' => $b->id, 'name' => $b->name, 'city' => $b->city, 'onboarded' => $b->onboarding_completed_at !== null,
                    'sales_30d_cents' => (int) Payment::where('branch_id', $b->id)->where('created_at', '>=', now()->subDays(30))->sum('amount_cents'),
                ]),
                'created_at' => $o->created_at->toIso8601String(),
            ]),
        ]);
    }

    public function updateOrganization(Request $request, int $orgId): JsonResponse
    {
        $this->guard($request);
        $org = Organization::findOrFail($orgId);
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['active', 'suspended'])],
            'feature_flags' => ['sometimes', 'array'],
            'feature_flags.*' => ['boolean'],
        ]);
        if (isset($data['feature_flags'])) {
            $data['feature_flags'] = array_intersect_key($data['feature_flags'], array_flip(self::FLAGS));
        }
        $org->update($data);
        Audit::record(null, 'platform.organization.updated', $org, $data, $request->user()->id);
        return response()->json(['ok' => true]);
    }

    public function audit(Request $request): JsonResponse
    {
        $this->guard($request);
        return response()->json(['data' => AuditLog::with('user:id,name')->latest('id')->limit(200)->get()->map(fn ($a) => [
            'id' => $a->id, 'organization_id' => $a->organization_id, 'branch_id' => $a->branch_id, 'action' => $a->action,
            'user' => $a->user?->name, 'actor' => $a->actor, 'created_at' => $a->created_at?->toIso8601String(),
        ])]);
    }
}
