<?php

namespace App\Domain\Realtime;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Dispatches realtime hints only after the surrounding transaction commits; never breaks the request. */
final class Realtime
{
    public static function emit(?int $branchId, string $name, array $payload = [], ?string $guestToken = null): void
    {
        DB::afterCommit(function () use ($branchId, $name, $payload, $guestToken) {
            try {
                broadcast(new RealtimeEvent($branchId, $guestToken, $name, $payload));
            } catch (Throwable $e) {
                Log::notice('Realtime broadcast skipped: '.$e->getMessage());
            }
        });
    }
}
