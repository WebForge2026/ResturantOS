# NOAR guest QR menu — design spec

## Current direction (owner request, 18.11.2026 — supersedes all earlier versions)
The owner asked to remove the rotating table entirely. The guest UI is now a **standard, clean QR menu** with the same light palette,
modern buttons, fast ordering and all functions intact.

- **Palette:** linen `#F4EEE4`, paper `#FBF8F3`, ink `#221C17`, brass `#A9824A`, terracotta `#B4552F` (gradient CTA), olive `#5E6B3A`.
- **Type:** Cormorant Garamond (brand, category titles, dish title in the sheet) and Manrope (UI, prices in bold).
- **`MenuList.tsx`:**
  - sticky search and category chips, with scroll-spy and a sliding active pill;
  - one section per category;
  - dish cards with the original Wolt photo (light-blue studio background kept on purpose), name, two-line description, price (EUR + informative BGN) and a round "+" button that morphs into a − n + stepper (spring layout animation, haptic tick).
- **`DishSheet.tsx`:**
  - a bottom sheet (drag to close) with a large photo, portion, description, allergens and nutrition (only when filled in), and options;
  - a full-width "+ Добави към поръчката" that becomes a stepper.
- **Kept from before:**
  - floating order bar → drawer `Вашата поръчка • Маса № 04` with the kitchen note → `Изпрати поръчката към кухнята` (real, idempotent submission);
  - the live status pill and tracker (Reverb with polling fallback);
  - `Поръчай още`, bill request and waiter call.
- **Performance:** native scrolling, lazy-loaded 720 px JPEGs, transform/opacity-only animations.

## Original brief (kept for reference)
The first version followed: an Obsidian `#050507` canvas, 1px gridlines, glassmorphism, crimson `#FF2A2A`/`#990000` rim light,
liquid chrome, grain, and a 3D turntable with `perspective: 1200px` and a crimson laser focus marker.
Original categories were: Салати · Основни ястия · Риба и морски дарове · Пица · Напитки и коктейли. They are now NOAR's real 14 Wolt categories.
For local demo testing, the URL `?table=N` maps to a table (default Маса № 04). In production only random QR tokens (`?t=`) authorise ordering.
