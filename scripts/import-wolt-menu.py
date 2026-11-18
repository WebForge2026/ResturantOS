#!/usr/bin/env python3
"""
Imports NOAR's public Wolt menu (categories, dishes, prices, photos) into seed data.

  python3 scripts/import-wolt-menu.py            # fetch live from Wolt
  python3 scripts/import-wolt-menu.py menu.json  # use a saved assortment JSON

Writes:
  backend/database/seeders/data/noar-menu.json
  backend/database/seeders/photos/<slug>.jpg    (original photo, max 720 px)

Then: cd backend && php artisan noar:reset
Only use for the restaurant's own menu/photos (or with the rights holder's permission).
"""
import io
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / 'backend/database/seeders/data/noar-menu.json'
OUT_IMG = ROOT / 'backend/database/seeders/photos'
SLUG = 'noar-bar-diner'
API = f'https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/{SLUG}/assortment?language=bg'
CACHE = ROOT / '.cache/wolt-photos'
UA = {'User-Agent': 'Mozilla/5.0 (NOAR menu import)'}

# category → preparation station code (see BranchProvisioner::DEFAULT_STATIONS)
STATION = {
    'Салати': 'cold', 'Брускети': 'cold', 'Добавки': 'cold',
    'Десерти': 'dessert', 'Напитки': 'bar',
}

CYR = dict(zip('абвгдежзийклмнопрстуфхцчшщъьюя', ['a', 'b', 'v', 'g', 'd', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'h', 'ts', 'ch', 'sh', 'sht', 'a', 'y', 'yu', 'ya']))


def slugify(text: str) -> str:
    t = ''.join(CYR.get(c, c) for c in text.lower())
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:80]


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        return r.read()


def portion_of(desc: str) -> str | None:
    m = re.search(r'(\d+(?:[.,]\d+)?\s*(?:г|гр|мл|л|см|бр)\.?)(?!\w)', desc or '', re.I)
    return m.group(1).strip() if m else None


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data = json.loads(Path(args[0]).read_text()) if args else json.loads(get(API))
    items = {i['id']: i for i in data['items']}
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    cats = []
    seen = set()
    for ci, c in enumerate(data['categories']):
        products = []
        for iid in c.get('item_ids', []):
            i = items.get(iid)
            if not i or i['id'] in seen:
                continue
            seen.add(i['id'])
            slug = slugify(i['name'])
            photo = None
            if i.get('images'):
                target = OUT_IMG / f'{slug}.jpg'
                if not target.exists() or '--rebuild' in sys.argv:
                    try:
                        cache = CACHE / f"{i['id']}.jpg"
                        if not cache.exists():
                            CACHE.mkdir(parents=True, exist_ok=True)
                            cache.write_bytes(get(i['images'][0]['url'] + '?w=960'))
                        im = Image.open(cache).convert('RGB')
                        im.thumbnail((720, 720), Image.LANCZOS)
                        im.save(target, 'JPEG', quality=80, optimize=True, progressive=True)
                    except Exception as e:  # keep importing; the dish just shows a placeholder
                        print('  ! photo failed', i['name'], e)
                photo = target.name if target.exists() else None
            desc = (i.get('description') or '').strip()
            only_portion = bool(re.fullmatch(r'[\d\s.,]*(г|гр|мл|л|см|бр)\.?\s*', desc, re.I))
            products.append({
                'name': i['name'].strip(),
                'description': '' if only_portion else desc,
                'portion': portion_of(desc),
                'price_cents': int(i['price']),
                'vat_rate_bps': int(round(float(i.get('vat_percentage_decimal') or 20) * 100)),
                'photo': photo,
                'source_id': i['id'],
            })
            print(f"  {c['name']} · {i['name']} · {i['price'] / 100:.2f} € · {'photo' if photo else 'no photo'}")
        if products:
            cats.append({'name': c['name'].strip(), 'slug': slugify(c['name']), 'sort': ci, 'station': STATION.get(c['name'].strip(), 'hot'), 'products': products})
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({'source': f'https://wolt.com/bg/bgr/blagoevgrad/restaurant/{SLUG}', 'currency': 'EUR', 'categories': cats}, ensure_ascii=False, indent=1))
    print(f'\n{sum(len(c["products"]) for c in cats)} dishes in {len(cats)} categories → {OUT_JSON.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
