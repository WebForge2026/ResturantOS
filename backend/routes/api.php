<?php

use App\Http\Controllers\Api\V1\Public\PublicMenuController;
use App\Http\Controllers\Api\V1\Staff\AuthController;
use App\Http\Controllers\Api\V1\Staff\BranchController;
use App\Http\Controllers\Api\V1\Staff\CheckController;
use App\Http\Controllers\Api\V1\Staff\InventoryController;
use App\Http\Controllers\Api\V1\Staff\MenuController;
use App\Http\Controllers\Api\V1\Staff\PlatformController;
use App\Http\Controllers\Api\V1\Staff\ReportController;
use App\Http\Controllers\Api\V1\Staff\ServiceController;
use App\Http\Controllers\Api\V1\Staff\StaffController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('system/status', [\App\Http\Controllers\Api\V1\SystemController::class, 'status']);
    Route::post('system/setup', [\App\Http\Controllers\Api\V1\SystemController::class, 'setup']);

    // ------------------------------------------------------------- public guest QR API
    Route::prefix('public')->middleware('throttle:qr-read')->group(function () {
        Route::get('demo/tables', [PublicMenuController::class, 'demoTables']);
        Route::get('tables/{token}', [PublicMenuController::class, 'table']);
        Route::post('tables/{token}/orders', [PublicMenuController::class, 'placeOrder'])->middleware('throttle:qr-write');
        Route::get('sessions/{guestToken}', [PublicMenuController::class, 'session']);
        Route::post('sessions/{guestToken}/requests', [PublicMenuController::class, 'serviceRequest'])->middleware('throttle:qr-write');
    });

    // ------------------------------------------------------------- auth
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:login');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('auth/me', [AuthController::class, 'show']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/pin-switch', [AuthController::class, 'pinSwitch'])->middleware('throttle:login');

        Route::prefix('platform')->group(function () {
            Route::get('organizations', [PlatformController::class, 'organizations']);
            Route::patch('organizations/{org}', [PlatformController::class, 'updateOrganization']);
            Route::get('audit', [PlatformController::class, 'audit']);
        });

        Route::prefix('branches/{branch}')->group(function () {
            Route::get('/', [BranchController::class, 'show'])->middleware('branch:branch.view');
            Route::patch('/', [BranchController::class, 'updateIdentity'])->middleware('branch:branch.manage');
            Route::patch('settings', [BranchController::class, 'updateSettings'])->middleware('branch:settings.manage');
            Route::patch('onboarding', [BranchController::class, 'updateOnboarding'])->middleware('branch:branch.manage');

            Route::get('floor', [BranchController::class, 'floor'])->middleware('branch:branch.view');
            Route::put('floor', [BranchController::class, 'saveFloor'])->middleware('branch:floor.manage');
            Route::get('qr-codes', [BranchController::class, 'qrCodes'])->middleware('branch:qr.manage');
            Route::post('tables/{table}/rotate-qr', [BranchController::class, 'rotateQr'])->middleware('branch:qr.manage');
            Route::post('stations', [BranchController::class, 'saveStation'])->middleware('branch:menu.manage');
            Route::put('stations/{station}', [BranchController::class, 'saveStation'])->middleware('branch:menu.manage');

            Route::get('menu', [MenuController::class, 'index'])->middleware('branch:orders.view');
            Route::post('categories', [MenuController::class, 'saveCategory'])->middleware('branch:menu.manage');
            Route::put('categories/{category}', [MenuController::class, 'saveCategory'])->middleware('branch:menu.manage');
            Route::delete('categories/{category}', [MenuController::class, 'deleteCategory'])->middleware('branch:menu.manage');
            Route::post('products', [MenuController::class, 'saveProduct'])->middleware('branch:menu.manage');
            Route::put('products/{product}', [MenuController::class, 'saveProduct'])->middleware('branch:menu.manage');
            Route::post('products/{product}/image', [MenuController::class, 'uploadImage'])->middleware('branch:menu.manage');
            Route::patch('products/{product}/availability', [MenuController::class, 'toggleAvailability'])->middleware('branch:orders.accept');
            Route::delete('products/{product}', [MenuController::class, 'deleteProduct'])->middleware('branch:menu.manage');
            Route::post('menu/import', [MenuController::class, 'import'])->middleware('branch:menu.manage');

            Route::get('staff', [StaffController::class, 'index'])->middleware('branch:staff.manage');
            Route::post('staff', [StaffController::class, 'store'])->middleware('branch:staff.manage');
            Route::patch('staff/{membership}', [StaffController::class, 'update'])->middleware('branch:staff.manage');

            // POS / waiter
            Route::get('tables-live', [ServiceController::class, 'tables'])->middleware('branch:orders.view');
            Route::post('sessions', [ServiceController::class, 'openSession'])->middleware('branch:orders.create');
            Route::get('sessions/{session}', [ServiceController::class, 'session'])->middleware('branch:orders.view');
            Route::post('sessions/{session}/orders', [ServiceController::class, 'staffOrder'])->middleware('branch:orders.create');
            Route::post('sessions/{session}/transfer', [ServiceController::class, 'transfer'])->middleware('branch:orders.transfer');
            Route::post('sessions/{session}/clear', [ServiceController::class, 'clear'])->middleware('branch:tables.clear');
            Route::post('sessions/{session}/waiter', [ServiceController::class, 'assignWaiter'])->middleware('branch:orders.transfer');
            Route::post('sessions/{session}/request-bill', [ServiceController::class, 'requestBill'])->middleware('branch:orders.view');
            Route::get('orders', [ServiceController::class, 'orders'])->middleware('branch:orders.view');
            Route::post('orders/{order}/accept', [ServiceController::class, 'accept'])->middleware('branch:orders.accept');
            Route::post('orders/{order}/cancel', [ServiceController::class, 'cancelOrder'])->middleware('branch:orders.cancel');
            Route::post('orders/{order}/serve', [ServiceController::class, 'serve'])->middleware('branch:orders.serve');
            Route::post('order-items/{item}/cancel', [ServiceController::class, 'cancelItem'])->middleware('branch:orders.cancel');
            Route::get('waiter/feed', [ServiceController::class, 'waiterFeed'])->middleware('branch:orders.view');
            Route::patch('requests/{serviceRequest}', [ServiceController::class, 'updateRequest'])->middleware('branch:requests.handle');

            // KDS / Bar (station permission checked per display inside controller)
            Route::get('kds', [ServiceController::class, 'kds'])->middleware('branch');
            Route::patch('prep-items/{prepItem}', [ServiceController::class, 'setPrepItem'])->middleware('branch');
            Route::patch('prep-tickets/{ticket}', [ServiceController::class, 'setTicket'])->middleware('branch');

            // Checks & simulated payments
            Route::get('checks/{check}', [CheckController::class, 'show'])->middleware('branch:checks.view');
            Route::get('checks/{check}/receipt', [CheckController::class, 'receipt'])->middleware('branch:checks.view');
            Route::post('checks/{check}/discount', [CheckController::class, 'discount'])->middleware('branch:checks.discount');
            Route::post('checks/{check}/split', [CheckController::class, 'split'])->middleware('branch:checks.split');
            Route::post('checks/{check}/merge', [CheckController::class, 'merge'])->middleware('branch:checks.split');
            Route::post('checks/{check}/payments', [CheckController::class, 'pay'])->middleware('branch:payments.take');
            Route::post('check-items/{checkItem}/void', [CheckController::class, 'voidItem'])->middleware('branch:checks.void_item');
            Route::get('shifts', [CheckController::class, 'shifts'])->middleware('branch:shifts.manage');
            Route::get('shifts/current', [CheckController::class, 'currentShift'])->middleware('branch:checks.view');
            Route::post('shifts', [CheckController::class, 'openShift'])->middleware('branch:shifts.manage');
            Route::post('shifts/{shift}/close', [CheckController::class, 'closeShift'])->middleware('branch:shifts.manage');

            // Inventory
            Route::get('ingredients', [InventoryController::class, 'ingredients'])->middleware('branch:inventory.view');
            Route::post('ingredients', [InventoryController::class, 'saveIngredient'])->middleware('branch:inventory.manage');
            Route::put('ingredients/{ingredient}', [InventoryController::class, 'saveIngredient'])->middleware('branch:inventory.manage');
            Route::post('ingredients/{ingredient}/adjust', [InventoryController::class, 'adjust'])->middleware('branch:inventory.manage');
            Route::get('stock-movements', [InventoryController::class, 'movements'])->middleware('branch:inventory.view');
            Route::get('suppliers', [InventoryController::class, 'suppliers'])->middleware('branch:inventory.view');
            Route::post('suppliers', [InventoryController::class, 'saveSupplier'])->middleware('branch:inventory.manage');
            Route::put('suppliers/{supplier}', [InventoryController::class, 'saveSupplier'])->middleware('branch:inventory.manage');
            Route::post('stock-receipts', [InventoryController::class, 'receive'])->middleware('branch:inventory.manage');
            Route::get('products/{product}/recipe', [InventoryController::class, 'recipe'])->middleware('branch:inventory.view');
            Route::put('products/{product}/recipe', [InventoryController::class, 'saveRecipe'])->middleware('branch:inventory.manage');

            // Reports & audit
            Route::get('reports/summary', [ReportController::class, 'summary'])->middleware('branch:reports.view');
            Route::get('reports/sales.csv', [ReportController::class, 'exportSales'])->middleware('branch:reports.view');
            Route::get('audit', [ReportController::class, 'audit'])->middleware('branch:audit.view');
        });
    });
});
