<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\DomainError;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Remote demo setup for hosts without a shell (e.g. Vercel).
 * Only active when NOAR_SETUP_KEY (≥ 32 chars) is configured and APP_ENV is not "production".
 * Remove NOAR_SETUP_KEY after the database has been set up.
 */
class SystemController extends Controller
{
    public function status(): JsonResponse
    {
        try {
            DB::connection()->getPdo();
            $db = true;
            $migrated = DB::getSchemaBuilder()->hasTable('organizations');
        } catch (Throwable) {
            $db = false;
            $migrated = false;
        }
        return response()->json(['ok' => true, 'database' => $db, 'migrated' => $migrated, 'env' => app()->environment()]);
    }

    public function setup(Request $request): JsonResponse
    {
        $key = (string) config('noar.setup_key');
        if (strlen($key) < 32 || app()->environment('production')) {
            abort(404);
        }
        if (! hash_equals($key, (string) $request->header('X-Setup-Key'))) {
            throw new DomainError('invalid_setup_key', 'Невалиден ключ за настройка.', 403);
        }
        @set_time_limit(300);
        config(['noar.seed_history' => $request->boolean('history', false)]);
        Artisan::call('migrate:fresh', ['--force' => true, '--seed' => true]);
        return response()->json(['ok' => true, 'output' => trim(Artisan::output())]);
    }
}
