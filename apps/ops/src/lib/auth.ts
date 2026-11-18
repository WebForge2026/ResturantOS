import { create } from 'zustand';
import type { Me } from './api';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

type AuthState = {
  token: string | null;
  me: Me | null;
  branchId: number | null;
  expired: boolean;
  setSession: (token: string, me: Me) => void;
  setMe: (me: Me) => void;
  setBranch: (id: number) => void;
  logout: (expired?: boolean) => void;
};

export const useAuth = create<AuthState>((set, get) => ({
  token: read('noar.token'),
  me: null,
  branchId: Number(read('noar.branch')) || null,
  expired: false,
  setSession: (token, me) => {
    write('noar.token', token);
    const branchId = me.branches.find((b) => b.id === get().branchId)?.id ?? me.branches[0]?.id ?? null;
    write('noar.branch', branchId ? String(branchId) : null);
    set({ token, me, branchId, expired: false });
  },
  setMe: (me) => {
    const branchId = me.branches.find((b) => b.id === get().branchId)?.id ?? me.branches[0]?.id ?? null;
    write('noar.branch', branchId ? String(branchId) : null);
    set({ me, branchId });
  },
  setBranch: (id) => {
    write('noar.branch', String(id));
    set({ branchId: id });
  },
  logout: (expired = false) => {
    write('noar.token', null);
    set({ token: null, me: null, expired });
  },
}));

export const useBranch = () => {
  const me = useAuth((s) => s.me);
  const branchId = useAuth((s) => s.branchId);
  return me?.branches.find((b) => b.id === branchId) ?? null;
};

export const useCan = () => {
  const branch = useBranch();
  return (perm: string) => !!branch?.permissions.includes(perm);
};

/** Landing route for a role. */
export const homeFor = (role: string | undefined, platform: boolean): string => {
  switch (role) {
    case 'owner':
    case 'manager':
      return '/admin';
    case 'shift_manager':
    case 'cashier':
      return '/pos';
    case 'waiter':
      return '/waiter';
    case 'kitchen':
      return '/kitchen';
    case 'bartender':
      return '/bar';
    case 'stock_manager':
      return '/admin/inventory';
    default:
      return platform ? '/platform' : '/login';
  }
};
