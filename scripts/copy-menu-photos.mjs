// Copies the dish photos from the backend seed data into an app's public/menu folder
// (they are served as static files, e.g. on Vercel). Usage: node ../../scripts/copy-menu-photos.mjs
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'backend/database/seeders/photos');
const dest = join(process.cwd(), 'public/menu');
if (!existsSync(src)) {
  console.warn('[menu photos] none found at', src);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('[menu photos] copied to', dest);
