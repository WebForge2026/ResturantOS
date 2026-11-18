// Shared API types for NOAR RestaurantOS. Money is always integer euro cents.

export type Cents = number;

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'in_preparation'
  | 'partially_ready'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled';

export type PrepStatus = 'queued' | 'preparing' | 'ready' | 'handed_off' | 'cancelled';

export type AcceptMode = 'auto' | 'manual';

export type Nutrition = {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  is_estimate: boolean;
};

export type PlateArt = {
  style: 'salad' | 'steak' | 'burger' | 'fish' | 'shrimp' | 'pasta' | 'pizza' | 'cocktail' | 'soda' | 'wine' | 'dessert' | 'soup';
  base: string;
  accents: string[];
};

export type ModifierOption = { id: number; name: string; price_delta_cents: Cents };

export type ModifierGroup = {
  id: number;
  name: string;
  kind: 'variant' | 'modifier';
  min: number;
  max: number;
  options: ModifierOption[];
};

export type PublicProduct = {
  id: number;
  name: string;
  description: string;
  ingredients: string | null;
  allergens: string[];
  price_cents: Cents;
  portion: string | null;
  image_url: string | null;
  art: PlateArt | null;
  nutrition: Nutrition | null;
  is_available: boolean;
  modifier_groups: ModifierGroup[];
};

export type PublicCategory = { id: number; name: string; slug: string; products: PublicProduct[] };

export type PublicTableContext = {
  restaurant: {
    name: string;
    currency: 'EUR';
    show_bgn: boolean;
    bgn_rate: number;
    accept_mode: AcceptMode;
  };
  table: { number: number; label: string; area: string | null };
  menu: { categories: PublicCategory[] };
};

export type DemoTable = { number: number; label: string; qr_token: string };

export type PublicOrderItem = {
  id: number;
  name: string;
  quantity: number;
  modifiers: string[];
  note: string | null;
  line_total_cents: Cents;
  status: PrepStatus | 'served';
};

export type PublicOrder = {
  public_id: string;
  number: number;
  status: OrderStatus;
  note: string | null;
  total_cents: Cents;
  created_at: string;
  items: PublicOrderItem[];
};

export type PublicSessionState = {
  guest_token: string;
  status: 'open' | 'bill_requested' | 'settled' | 'closed';
  table: { number: number; label: string };
  orders: PublicOrder[];
  check: { total_cents: Cents; paid_cents: Cents; due_cents: Cents } | null;
  open_requests: Array<{ type: 'bill' | 'waiter'; status: string }>;
};

export type CartLineInput = {
  product_id: number;
  quantity: number;
  modifier_ids: number[];
  note?: string | null;
};

export type PlaceOrderResponse = { order: PublicOrder; guest_token: string };

export type ApiErrorBody = {
  error: { code: string; message: string; details?: Record<string, string[]> };
};
