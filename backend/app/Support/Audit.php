<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\Branch;
use Illuminate\Database\Eloquent\Model;

final class Audit
{
    public static function record(?Branch $branch, string $action, ?Model $subject = null, array $meta = [], ?int $userId = null, string $actor = 'user'): void
    {
        $userId ??= auth()->id();
        AuditLog::create([
            'organization_id' => $branch?->organization_id,
            'branch_id' => $branch?->id,
            'user_id' => $userId,
            'actor' => $userId ? $actor : ($actor === 'user' ? 'system' : $actor),
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'meta' => $meta ?: null,
        ]);
    }
}
