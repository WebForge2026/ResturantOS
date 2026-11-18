import type { OrderStatus, PrepStatus } from '@noar/types';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Поръчката е получена',
  accepted: 'Поръчката е приета',
  in_preparation: 'Приготвя се',
  partially_ready: 'Частично готова',
  ready: 'Готова за сервиране',
  served: 'Сервирана',
  completed: 'Сервирана',
  cancelled: 'Отказана',
};

export const ORDER_STEPS: OrderStatus[] = ['pending', 'accepted', 'in_preparation', 'partially_ready', 'ready', 'served'];

export const stepIndex = (s: OrderStatus): number => {
  if (s === 'completed') return ORDER_STEPS.length - 1;
  if (s === 'cancelled') return -1;
  return ORDER_STEPS.indexOf(s);
};

export const ITEM_STATUS_LABEL: Record<PrepStatus | 'served', string> = {
  queued: 'В опашка',
  preparing: 'Приготвя се',
  ready: 'Готово',
  handed_off: 'Сервирано',
  served: 'Сервирано',
  cancelled: 'Отказано',
};

export const pad2 = (n: number) => String(n).padStart(2, '0');
