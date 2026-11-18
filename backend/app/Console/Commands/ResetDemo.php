<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/** One-command local reset. Refuses to run outside local/testing environments. */
class ResetDemo extends Command
{
    protected $signature = 'noar:reset';

    protected $description = 'Drop all tables and re-seed the NOAR demo (LOCAL ONLY)';

    public function handle(): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('noar:reset е разрешена само при APP_ENV=local.');
            return self::FAILURE;
        }
        $this->call('migrate:fresh', ['--seed' => true, '--force' => true]);
        $this->info('Демо данните са заредени отново.');
        return self::SUCCESS;
    }
}
