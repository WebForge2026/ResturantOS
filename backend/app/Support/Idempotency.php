<?php

namespace App\Support;

use App\Models\IdempotencyKey;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * Replays the stored response for a repeated Idempotency-Key so retries never create
 * duplicate orders/payments. The callback must return [status, body].
 */
final class Idempotency
{
    public static function handle(Request $request, string $scope, Closure $callback, bool $required = false): JsonResponse
    {
        $key = $request->header('Idempotency-Key');
        if (! $key) {
            if ($required) {
                throw new DomainError('idempotency_key_required', 'Липсва ключ за идемпотентност (Idempotency-Key).', 400);
            }
            [$status, $body] = $callback();
            return response()->json($body, $status);
        }
        if (strlen($key) > 100) {
            throw new DomainError('idempotency_key_invalid', 'Невалиден Idempotency-Key.', 400);
        }

        $hash = hash('sha256', $request->method().'|'.$request->path().'|'.json_encode($request->all()));

        $existing = IdempotencyKey::where('scope', $scope)->where('key', $key)->first();
        if ($existing) {
            return self::replay($existing, $hash);
        }

        try {
            $row = IdempotencyKey::create(['scope' => $scope, 'key' => $key, 'request_hash' => $hash]);
        } catch (UniqueConstraintViolationException) {
            return self::replay(IdempotencyKey::where('scope', $scope)->where('key', $key)->firstOrFail(), $hash);
        }

        try {
            [$status, $body] = $callback();
        } catch (Throwable $e) {
            $row->delete();
            throw $e;
        }

        $row->update(['response_status' => $status, 'response_body' => $body]);
        return response()->json($body, $status);
    }

    private static function replay(IdempotencyKey $row, string $hash): JsonResponse
    {
        if (! hash_equals($row->request_hash, $hash)) {
            throw new DomainError('idempotency_key_reused', 'Този ключ вече е използван за различна заявка.', 422);
        }
        if ($row->response_status === null) {
            throw new DomainError('request_in_progress', 'Заявката все още се обработва. Опитайте след момент.', 409);
        }
        return response()->json($row->response_body, $row->response_status)->header('Idempotent-Replay', 'true');
    }
}
