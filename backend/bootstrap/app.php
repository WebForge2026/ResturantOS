<?php

use App\Http\Middleware\ResolveBranch;
use App\Support\DomainError;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

$err = fn (string $code, string $message, int $status, ?array $details = null) => response()->json(
    ['error' => array_filter(['code' => $code, 'message' => $message, 'details' => $details], fn ($v) => $v !== null)],
    $status,
);

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix' => 'api', 'middleware' => ['auth:sanctum']])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias(['branch' => ResolveBranch::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) use ($err): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*') || $request->expectsJson());
        $exceptions->render(fn (DomainError $e) => $err($e->errorCode, $e->getMessage(), $e->status));
        $exceptions->render(fn (ValidationException $e, Request $r) => $r->is('api/*')
            ? $err('validation_failed', 'Моля, проверете въведените данни.', 422, $e->errors()) : null);
        $exceptions->render(fn (AuthenticationException $e, Request $r) => $r->is('api/*')
            ? $err('unauthenticated', 'Моля, влезте в профила си.', 401) : null);
        $exceptions->render(fn (AuthorizationException|AccessDeniedHttpException $e, Request $r) => $r->is('api/*')
            ? $err('forbidden', 'Нямате права за това действие.', 403) : null);
        $exceptions->render(fn (ModelNotFoundException|NotFoundHttpException $e, Request $r) => $r->is('api/*')
            ? $err('not_found', 'Ресурсът не е намерен.', 404) : null);
        $exceptions->render(fn (ThrottleRequestsException $e, Request $r) => $r->is('api/*')
            ? $err('too_many_requests', 'Твърде много заявки. Опитайте отново след малко.', 429) : null);
        $exceptions->render(fn (HttpExceptionInterface $e, Request $r) => $r->is('api/*')
            ? $err('http_error', $e->getMessage() ?: 'Грешка', $e->getStatusCode()) : null);
    })->create();
