<?php

return [
    'demo_table_lookup' => (bool) env('NOAR_DEMO_TABLE_LOOKUP', false),
    'demo_branch_slug' => env('NOAR_DEMO_BRANCH_SLUG', 'noar-sofia'),
    'demo_password' => env('NOAR_DEMO_PASSWORD'),
    'bgn_per_eur' => 1.95583,
    'seed_history' => (bool) env('NOAR_SEED_HISTORY', true),
];
