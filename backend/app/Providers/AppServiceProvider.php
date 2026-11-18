<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        RateLimiter::for('qr-read', fn (Request $r) => Limit::perMinute(240)->by($r->ip()));
        // Anonymous ordering: per IP and per table token.
        RateLimiter::for('qr-write', fn (Request $r) => [
            Limit::perMinute(20)->by('ip:'.$r->ip()),
            Limit::perMinute(12)->by('tok:'.($r->route('token') ?? $r->route('guestToken'))),
        ]);
        RateLimiter::for('login', fn (Request $r) => Limit::perMinute(10)->by($r->ip().'|'.strtolower((string) $r->input('email'))));
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(600)->by($r->user()?->id ?: $r->ip()));
    }
}
