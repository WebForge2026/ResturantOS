# NOAR guest QR menu — design spec

## Current direction (owner request, 18.11.2026 — supersedes the original dark brief)
The owner rejected the original "black / crimson cyber-industrial" look and asked for the design shown in their
reference video. That video shows a round wooden table seen from above with real plated dishes on its rim.
The table turns by drag or scroll, with elegant serif typography beside it. The owner also asked for **lighter colours**
suited to a modern bar & dinner, real dishes, and smooth, lag-free mobile rotation. All functionality stays as it is.

**Implemented:**
- **Palette:** linen `#F4EEE4`, paper `#FBF8F3`, ink `#221C17`, brass `#A9824A`, terracotta CTA `#B4552F`, olive `#5E6B3A`, walnut table. No black/red.
- **Type:** Cormorant Garamond (display, has Cyrillic) and Manrope (UI).
- **The table (`TurntableMenu.tsx`):**
  - a large round walnut table whose upper arc is visible on phones, or the right column on desktop;
  - dishes sit on the rim; the category's dishes repeat to fill the table;
  - the front (12 o'clock) plate is focused, with a brass marker above it;
  - drag or swipe with inertia and a spring snap; tap a plate to bring it forward; tap the front plate for a close-up;
  - Предишно / Следващо buttons, arrow keys, and a reduced-motion fallback.
- **Performance:** the whole table is a single element rotated by one transform (GPU layer). Plates never re-layout while it turns.
- **Real photos:** `product.image_url` fills the plate. Upload in Admin or bulk-import (`php artisan noar:import-photos`).
  Without a photo, a drawn ceramic plate is shown as a **documented placeholder**. An optional real wood photo is supported via `NEXT_PUBLIC_TABLE_TEXTURE`.
- **Everything else is kept:**
  - the spec card with nutrition in 4 columns (Калории / Протеини / Мазнини / Въглехидрати, marked as estimates);
  - variants and modifiers; `+ Добави към поръчката` → `− 1 +`;
  - floating order bar → drawer `Вашата поръчка • Маса № 04` with the note `Бележка към кухнята (напр. без лук, средно изпечено...)` and `Изпрати поръчката към кухнята`;
  - the live status pill and tracker (`Поръчката е получена … Сервирана`) with `Поръчай още`, bill request and waiter call.
- **Brand:** only NOAR BAR & DINNER in the guest UI; Bulgarian text throughout.

## Original brief (kept for reference)
The first version followed: an Obsidian `#050507` canvas, 1px gridlines, glassmorphism, crimson `#FF2A2A`/`#990000` rim light,
liquid chrome, grain, and a 3D turntable with `perspective: 1200px` and a crimson laser focus marker.
Categories (unchanged): Салати · Основни ястия · Риба и морски дарове · Пица · Напитки и коктейли.
For local demo testing, the URL `?table=N` maps to a table (default Маса № 04). In production only random QR tokens (`?t=`) authorise ordering.
