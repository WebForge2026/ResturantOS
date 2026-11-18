<?php

/*
 * Vercel serverless entry point (runtime: vercel-php).
 * Vercel's filesystem is read-only except /tmp, so Laravel's writable paths are redirected there.
 */

$tmp = '/tmp/laravel';
foreach (["$tmp/storage/framework/cache/data", "$tmp/storage/framework/views", "$tmp/storage/framework/sessions", "$tmp/storage/logs", "$tmp/storage/app/public"] as $dir) {
    if (! is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
}

foreach ([
    'APP_CONFIG_CACHE' => "$tmp/config.php",
    'APP_EVENTS_CACHE' => "$tmp/events.php",
    'APP_PACKAGES_CACHE' => "$tmp/packages.php",
    'APP_ROUTES_CACHE' => "$tmp/routes.php",
    'APP_SERVICES_CACHE' => "$tmp/services.php",
    'VIEW_COMPILED_PATH' => "$tmp/storage/framework/views",
] as $key => $value) {
    putenv("$key=$value");
    $_ENV[$key] = $_SERVER[$key] = $value;
}

// Serve as if from public/index.php so Laravel does not treat "/api" as the base path.
$_SERVER['SCRIPT_FILENAME'] = __DIR__.'/../public/index.php';
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';

define('LARAVEL_START', microtime(true));

require __DIR__.'/../vendor/autoload.php';

/** @var \Illuminate\Foundation\Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';
$app->useStoragePath("$tmp/storage");

$app->handleRequest(\Illuminate\Http\Request::capture());
