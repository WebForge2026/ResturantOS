import { createHttp, newIdempotencyKey } from '@noar/api-client';
import { useAuth } from './auth';

export { ApiError, formatEur, formatBgn, newIdempotencyKey } from '@noar/api-client';

export const http = createHttp({
  baseUrl: '',
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => useAuth.getState().logout(true),
});

/** Branch-scoped request helper. */
export const bApi = <T>(path: string, opts: Parameters<typeof http>[1] = {}) => {
  const branchId = useAuth.getState().branchId;
  if (!branchId) throw new Error('Няма избран обект');
  return http<T>(`/branches/${branchId}${path === "/" ? "" : path}`, opts);
};

export const mutate = <T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown, idempotent = false) =>
  bApi<T>(path, { method, body, idempotencyKey: idempotent ? newIdempotencyKey() : undefined });

// ------------------------------------------------------------------ shared types

export type Me = {
  id: number;
  name: string;
  email: string;
  is_platform_admin: boolean;
  branches: Array<{
    id: number;
    name: string;
    organization: string;
    organization_status: string;
    role: string;
    role_label: string;
    permissions: string[];
    onboarding_completed: boolean;
  }>;
};

export type LiveTable = {
  id: number;
  number: number;
  label: string;
  seats: number;
  shape: 'round' | 'square' | 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  floor_area_id: number | null;
  status: 'available' | 'occupied' | 'bill' | 'settled';
  flags: Array<'ready' | 'pending' | 'call'>;
  session: null | { id: number; status: string; opened_at: string; waiter: string | null; total_cents: number | null; due_cents: number | null };
};

export type StaffOrderItem = {
  id: number;
  name: string;
  quantity: number;
  modifiers: string[];
  note: string | null;
  unit_price_cents: number;
  line_total_cents: number;
  status: 'queued' | 'preparing' | 'ready' | 'served' | 'cancelled';
  station_id: number | null;
  served_at: string | null;
  prep_item_id: number | null;
};

export type StaffOrder = {
  id: number;
  public_id: string;
  number: number;
  status: string;
  source: 'qr' | 'staff';
  note: string | null;
  table_id: number;
  table_label: string | null;
  session_id: number;
  subtotal_cents: number;
  created_at: string;
  accepted_at: string | null;
  items: StaffOrderItem[];
};

export type CheckDto = {
  id: number;
  seq: number;
  status: 'open' | 'settled' | 'void';
  subtotal_cents: number;
  discount_cents: number;
  discount_reason: string | null;
  service_charge_cents: number;
  total_cents: number;
  paid_cents: number;
  due_cents: number;
  tip_cents: number;
  version: number;
  vat_breakdown: Array<{ rate_bps: number; gross_cents: number; vat_cents: number }>;
  items: Array<{ id: number; order_item_id: number | null; name: string; quantity: number; unit_price_cents: number; total_cents: number; paid_cents: number; voided: boolean; void_reason: string | null }>;
  payments: Array<{ id: number; method: 'cash' | 'card'; mode: string; amount_cents: number; tip_cents: number; tendered_cents: number | null; change_cents: number; reference: string; is_simulated: boolean; created_at: string }>;
};

export type SessionDetail = {
  session: {
    id: number;
    status: string;
    table: { id: number; label: string; number: number };
    waiter: { id: number; name: string } | null;
    guests: number | null;
    opened_at: string;
    bill_requested_at: string | null;
  };
  orders: StaffOrder[];
  checks: CheckDto[];
  requests: Array<{ id: number; type: 'bill' | 'waiter'; status: string; created_at: string }>;
};

export type MenuProduct = {
  id: number;
  name: string;
  description: string;
  ingredients: string | null;
  allergens: string[];
  price_cents: number;
  portion: string | null;
  image_url: string | null;
  art: { style: string; base: string; accents: string[] } | null;
  nutrition: { kcal: number | null; protein: number | null; fat: number | null; carbs: number | null; is_estimate: boolean } | null;
  is_available: boolean;
  modifier_groups: Array<{ id: number; name: string; kind: 'variant' | 'modifier'; min: number; max: number; options: Array<{ id: number; name: string; price_delta_cents: number }> }>;
  category_id: number;
  station_id: number | null;
  sku: string | null;
  vat_rate_bps: number;
  is_published: boolean;
  auto_unavailable_on_low_stock: boolean;
  sort: number;
  has_recipe: boolean | null;
};

export type MenuData = {
  categories: Array<{ id: number; name: string; slug: string; sort: number; is_active: boolean }>;
  products: MenuProduct[];
  stations: Array<{ id: number; name: string; code: string; display: 'kitchen' | 'bar'; color: string }>;
};
