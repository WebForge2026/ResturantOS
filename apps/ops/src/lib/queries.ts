import { useQuery } from '@tanstack/react-query';
import { bApi, type MenuData } from './api';
import { useAuth } from './auth';

/** Every branch query key starts with ['b', branchId] so realtime events can invalidate them all. */
export const useBranchQuery = <T,>(key: Array<string | number | boolean | undefined | null>, path: string, opts: { refetchInterval?: number | false; enabled?: boolean } = {}) => {
  const branchId = useAuth((s) => s.branchId);
  return useQuery<T>({
    queryKey: ['b', branchId, ...key],
    queryFn: () => bApi<T>(path),
    enabled: !!branchId && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
  });
};

export const useMenu = () => useBranchQuery<MenuData>(['menu'], '/menu', { refetchInterval: 60000 });

export type BranchInfo = {
  branch: {
    id: number;
    name: string;
    brand_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    timezone: string;
    opening_hours: Array<{ day: number; open: string | null; close: string | null; closed: boolean }> | null;
    settings: {
      order_accept_mode: 'auto' | 'manual';
      show_bgn: boolean;
      service_charge_bps: number;
      tips_enabled: boolean;
      require_shift_for_payments: boolean;
      stock_reservation_enabled: boolean;
      brand_accent: string;
    };
    onboarding: { completed_steps: string[]; current?: string } | null;
    onboarding_completed_at: string | null;
  };
  permissions: string[];
  role: string;
  stations: Array<{ id: number; name: string; code: string; display: 'kitchen' | 'bar'; color: string }>;
};

export const useBranchInfo = () => useBranchQuery<BranchInfo>(['info'], '/');
