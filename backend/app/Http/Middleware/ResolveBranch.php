<?php

namespace App\Http\Middleware;

use App\Models\Branch;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tenant guard for /branches/{branch}/… routes.
 * Usage: ->middleware('branch') or ->middleware('branch:permission.name').
 * Returns 404 (not 403) for branches outside the user's organizations to avoid leaking existence.
 */
class ResolveBranch
{
    public function handle(Request $request, Closure $next, ?string $permission = null): Response
    {
        $branch = $request->route('branch');
        if (! $branch instanceof Branch) {
            $branch = Branch::find($branch);
        }
        $user = $request->user();
        if (! $branch || ! $user || ! $user->is_active) {
            abort(404);
        }
        $user->loadMissing('memberships');
        if (! $user->membershipFor($branch)) {
            abort(404);
        }
        if ($branch->organization->status !== 'active') {
            abort(403, 'Организацията е спряна.');
        }
        if ($permission && ! $user->canInBranch($branch, $permission)) {
            abort(403, 'Нямате права за това действие.');
        }
        $request->attributes->set('branch', $branch);
        // Controllers receive the remaining route parameters positionally.
        $request->route()->forgetParameter('branch');
        return $next($request);
    }
}
