import { createPublicApi } from '@noar/api-client';

// Same-origin: Next.js rewrites /api/* to Laravel, so phones on the LAN only need port 3000.
export const api = createPublicApi({ baseUrl: '' });
