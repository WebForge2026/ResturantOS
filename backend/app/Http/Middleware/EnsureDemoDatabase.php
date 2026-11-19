<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

/**
 * NOAR_AUTO_SETUP=true (demo hosting without a shell, e.g. Vercel):
 * if the database is EMPTY, run the migrations and the NOAR demo seed once.
 * A database that already has tables is never touched.
 */
class EnsureDemoDatabase
{
    private const FLAG = '/tmp/noar-db-ready';

    public function handle(Request $request, Closure $next): Response
    {
        if (! config('noar.auto_setup') || is_file(self::FLAG)) {
            return $next($request);
        }
        if (! Schema::hasTable('organizations')) {
            $pg = DB::getDriverName() === 'pgsql';
            if ($pg) {
                DB::select('select pg_advisory_lock(735001)'); // only one instance seeds
            }
            try {
                if (! Schema::hasTable('organizations')) {
                    @set_time_limit(300);
                    config(['noar.seed_history' => (bool) env('NOAR_SEED_HISTORY', false)]);
                    Artisan::call('migrate', ['--force' => true, '--seed' => true]);
                }
            } finally {
                if ($pg) {
                    DB::select('select pg_advisory_unlock(735001)');
                }
            }
        }
        @touch(self::FLAG);
        return $next($request);
    }
}
