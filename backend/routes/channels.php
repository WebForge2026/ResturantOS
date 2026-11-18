<?php

use App\Models\Branch;
use Illuminate\Support\Facades\Broadcast;

// Private staff channel per branch: only members of that branch's organization/branch.
Broadcast::channel('branch.{branchId}', function ($user, int $branchId) {
    $branch = Branch::find($branchId);
    if (! $branch || ! $user->is_active) {
        return false;
    }
    $user->loadMissing('memberships');
    return $user->membershipFor($branch) !== null;
});
