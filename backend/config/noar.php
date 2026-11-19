<?php

return [
    'demo_table_lookup' => (bool) env('NOAR_DEMO_TABLE_LOOKUP', false),
    'demo_branch_slug' => env('NOAR_DEMO_BRANCH_SLUG', 'noar-sofia'),
    'demo_password' => env('NOAR_DEMO_PASSWORD'),
    'bgn_per_eur' => 1.95583,
    // Dish photos are shipped with the frontends (copied to public/menu at build); image_url = base + file
    'photo_base' => env('NOAR_PHOTO_BASE', '/menu/'),
    // One-time remote setup (e.g. Vercel): POST /api/v1/system/setup with header X-Setup-Key.
    // Disabled unless a long random key is configured. Remove the key after setup.
    'setup_key' => env('NOAR_SETUP_KEY'),
    // Demo hosting: migrate + seed automatically when the database is empty (see EnsureDemoDatabase).
    'auto_setup' => (bool) env('NOAR_AUTO_SETUP', false),
    'seed_history' => (bool) env('NOAR_SEED_HISTORY', true),
];
