<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

abstract class Controller
{
    protected function branch(Request $request): Branch
    {
        return $request->attributes->get('branch');
    }

    /** Tenant guard for nested resources: the model must belong to the resolved branch. */
    protected function own(?Model $model, Branch $branch, string $column = 'branch_id'): Model
    {
        if (! $model || (int) $model->{$column} !== (int) $branch->id) {
            abort(404);
        }
        return $model;
    }

    protected function requirePermission(Request $request, string $permission): void
    {
        if (! $request->user()->canInBranch($this->branch($request), $permission)) {
            abort(403);
        }
    }
}
