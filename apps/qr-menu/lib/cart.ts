import type { PublicProduct } from '@noar/types';

export type CartLine = {
  key: string;
  product: PublicProduct;
  quantity: number;
  modifierIds: number[];
  modifierNames: string[];
  unitCents: number; // client preview only — server recalculates
};

export type CartAction =
  | { type: 'add'; product: PublicProduct; modifierIds: number[] }
  | { type: 'inc'; key: string }
  | { type: 'dec'; key: string }
  | { type: 'remove'; key: string }
  | { type: 'clear' }
  | { type: 'hydrate'; lines: CartLine[] };

export const lineKey = (productId: number, modifierIds: number[]) => `${productId}:${[...modifierIds].sort((a, b) => a - b).join('.')}`;

export const unitPreview = (product: PublicProduct, modifierIds: number[]) =>
  product.price_cents +
  product.modifier_groups.flatMap((g) => g.options).filter((o) => modifierIds.includes(o.id)).reduce((s, o) => s + o.price_delta_cents, 0);

export const cartReducer = (state: CartLine[], action: CartAction): CartLine[] => {
  switch (action.type) {
    case 'add': {
      const key = lineKey(action.product.id, action.modifierIds);
      const existing = state.find((l) => l.key === key);
      if (existing) return state.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l));
      const names = action.product.modifier_groups.flatMap((g) => g.options).filter((o) => action.modifierIds.includes(o.id)).map((o) => o.name);
      return [...state, { key, product: action.product, quantity: 1, modifierIds: action.modifierIds, modifierNames: names, unitCents: unitPreview(action.product, action.modifierIds) }];
    }
    case 'inc':
      return state.map((l) => (l.key === action.key ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l));
    case 'dec':
      return state.flatMap((l) => (l.key !== action.key ? [l] : l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []));
    case 'remove':
      return state.filter((l) => l.key !== action.key);
    case 'clear':
      return [];
    case 'hydrate':
      return action.lines;
  }
};

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
export const cartTotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity * l.unitCents, 0);
