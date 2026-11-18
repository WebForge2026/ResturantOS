<?php

namespace App\Support;

/**
 * Role → permission map. Server-side source of truth; enforced on every private endpoint.
 */
final class Permissions
{
    public const ROLES = [
        'owner' => 'Собственик',
        'manager' => 'Мениджър',
        'shift_manager' => 'Управител на смяна',
        'waiter' => 'Сервитьор',
        'cashier' => 'Касиер',
        'kitchen' => 'Кухня',
        'bartender' => 'Бармен',
        'stock_manager' => 'Склад',
    ];

    public const ALL = [
        'branch.view', 'branch.manage', 'staff.manage', 'menu.manage', 'floor.manage', 'qr.manage',
        'orders.view', 'orders.create', 'orders.accept', 'orders.cancel', 'orders.serve', 'orders.transfer',
        'kds.kitchen', 'kds.bar',
        'checks.view', 'checks.discount', 'checks.void_item', 'checks.split', 'payments.take', 'payments.refund',
        'shifts.manage', 'tables.clear', 'requests.handle',
        'inventory.view', 'inventory.manage', 'reports.view', 'audit.view', 'settings.manage',
    ];

    private const MAP = [
        'owner' => ['*'],
        'manager' => ['*'],
        'shift_manager' => [
            'branch.view', 'orders.view', 'orders.create', 'orders.accept', 'orders.cancel', 'orders.serve', 'orders.transfer',
            'kds.kitchen', 'kds.bar', 'checks.view', 'checks.discount', 'checks.void_item', 'checks.split', 'payments.take',
            'payments.refund', 'shifts.manage', 'tables.clear', 'requests.handle', 'inventory.view', 'reports.view', 'audit.view',
        ],
        'waiter' => [
            'branch.view', 'orders.view', 'orders.create', 'orders.accept', 'orders.serve', 'orders.transfer',
            'checks.view', 'checks.split', 'tables.clear', 'requests.handle',
        ],
        'cashier' => [
            'branch.view', 'orders.view', 'orders.create', 'orders.accept', 'orders.serve', 'checks.view', 'checks.split',
            'payments.take', 'shifts.manage', 'tables.clear', 'requests.handle',
        ],
        'kitchen' => ['branch.view', 'kds.kitchen'],
        'bartender' => ['branch.view', 'kds.bar', 'orders.view', 'orders.serve'],
        'stock_manager' => ['branch.view', 'inventory.view', 'inventory.manage', 'reports.view'],
    ];

    public static function forRole(string $role, array $extra = []): array
    {
        $perms = self::MAP[$role] ?? [];
        if (in_array('*', $perms, true)) {
            return self::ALL;
        }
        return array_values(array_unique(array_merge($perms, array_intersect($extra, self::ALL))));
    }
}
