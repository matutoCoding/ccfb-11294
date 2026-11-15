import { create } from 'zustand';
import type { AppSettings, Order } from '../types';
import { DEFAULT_SETTINGS, createOrder, uid } from '../constants';
import { downloadBlob, safeFileName } from '../lib/util';
import { idbClear, idbGetAll, idbPut } from '../lib/idb';

const SETTINGS_KEY = 'neon-studio/settings/v1';
const CURRENT_KEY = 'neon-studio/current/v1';
const LEGACY_ORDER_KEY = 'neon-studio/orders/v1';

interface OrderStore {
  orders: Order[];
  currentId: string | null;
  loaded: boolean;
  hydrate: () => Promise<void>;
  select: (id: string) => void;
  create: (name?: string) => Order;
  duplicate: (id: string) => Order | null;
  remove: (id: string) => Promise<void>;
  rename: (id: string, name: string) => void;
  upsert: (order: Order) => void;
  patchCurrent: (patch: Partial<Order>) => void;
  exportJson: (id: string) => void;
  exportAll: () => void;
  importJson: (text: string) => { added: number; skipped: number };
}

function persist(orders: Order[]): void {
  // 异步写入 IndexedDB，容量远大于 localStorage
  Promise.all(orders.map((o) => idbPut('orders', o))).catch((err) =>
    console.error('订单持久化失败', err),
  );
}

export const useOrderStore = create<OrderStore>((set, get) => ({
  orders: [],
  currentId: null,
  loaded: false,

  hydrate: async () => {
    if (get().loaded) return;
    let orders: Order[] = [];
    try {
      orders = await idbGetAll<Order>('orders');

      // 首次迁移：从旧 localStorage 读取
      const legacy = localStorage.getItem(LEGACY_ORDER_KEY);
      if ((!orders || orders.length === 0) && legacy) {
        try {
          const parsed = JSON.parse(legacy) as Order[];
          if (Array.isArray(parsed) && parsed.length) {
            orders = parsed;
            await Promise.all(orders.map((o) => idbPut('orders', o)));
          }
        } catch {
          /* 忽略损坏的旧数据 */
        }
        localStorage.removeItem(LEGACY_ORDER_KEY);
      }
    } catch (err) {
      console.error('订单读取失败', err);
      orders = [];
    }

    const currentId = localStorage.getItem(CURRENT_KEY);
    set({
      orders,
      loaded: true,
      currentId: currentId && orders.some((o) => o.id === currentId) ? currentId : orders[0]?.id ?? null,
    });
  },

  select: (id) => {
    localStorage.setItem(CURRENT_KEY, id);
    set({ currentId: id });
  },

  create: (name) => {
    const settings = getSettings();
    const order = createOrder(name ?? `订单 ${get().orders.length + 1}`, settings);
    const orders = [order, ...get().orders];
    persist(orders);
    localStorage.setItem(CURRENT_KEY, order.id);
    set({ orders, currentId: order.id });
    return order;
  },

  duplicate: (id) => {
    const src = get().orders.find((o) => o.id === id);
    if (!src) return null;
    const now = Date.now();
    const copy: Order = {
      ...structuredClone(src),
      id: uid('order'),
      name: `${src.name} 副本`,
      createdAt: now,
      updatedAt: now,
      runs: src.runs.map((r) => ({ ...r, id: uid('run') })),
    };
    const orders = [copy, ...get().orders];
    persist(orders);
    set({ orders });
    return copy;
  },

  remove: async (id) => {
    const orders = get().orders.filter((o) => o.id !== id);
    persist(orders);
    const currentId = get().currentId === id ? orders[0]?.id ?? null : get().currentId;
    if (currentId) localStorage.setItem(CURRENT_KEY, currentId);
    set({ orders, currentId });
  },

  rename: (id, name) => {
    const orders = get().orders.map((o) => (o.id === id ? { ...o, name, updatedAt: Date.now() } : o));
    persist(orders);
    set({ orders });
  },

  upsert: (order) => {
    const idx = get().orders.findIndex((o) => o.id === order.id);
    const stamped = { ...order, updatedAt: Date.now() };
    const orders =
      idx >= 0 ? get().orders.map((o) => (o.id === order.id ? stamped : o)) : [stamped, ...get().orders];
    persist(orders);
    set({ orders });
  },

  patchCurrent: (patch) => {
    const id = get().currentId;
    if (!id) return;
    get().upsert({ ...(get().orders.find((o) => o.id === id) as Order), ...patch });
  },

  exportJson: (id) => {
    const order = get().orders.find((o) => o.id === id);
    if (!order) return;
    const blob = new Blob([JSON.stringify({ app: 'neon-sign-studio', version: 1, order }, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, `${safeFileName(order.name)}.neon.json`);
  },

  exportAll: () => {
    const blob = new Blob(
      [JSON.stringify({ app: 'neon-sign-studio', version: 1, orders: get().orders }, null, 2)],
      { type: 'application/json' },
    );
    downloadBlob(blob, `neon-orders-${new Date().toISOString().slice(0, 10)}.json`);
  },

  importJson: (text) => {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('文件不是有效的 JSON');
    }
    const incoming: Order[] = [];
    const d = data as { order?: Order; orders?: Order[] };
    if (d.order) incoming.push(d.order);
    if (Array.isArray(d.orders)) incoming.push(...d.orders);
    if (incoming.length === 0) throw new Error('文件中没有找到订单数据');

    const existing = new Set(get().orders.map((o) => o.id));
    let skipped = 0;
    const merged = [...get().orders];
    for (const order of incoming) {
      if (!order.id || !order.source || !order.board) {
        skipped++;
        continue;
      }
      if (existing.has(order.id)) {
        order.id = uid('order');
        order.runs = (order.runs ?? []).map((r) => ({ ...r, id: uid('run') }));
      }
      merged.unshift(order);
      existing.add(order.id);
    }
    persist(merged);
    set({ orders: merged, currentId: get().currentId ?? merged[0]?.id ?? null });
    return { added: incoming.length - skipped, skipped };
  },
}));

function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsStore {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: getSettings(),
  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('设置保存失败', err);
    }
    set({ settings });
  },
  reset: () => {
    localStorage.removeItem(SETTINGS_KEY);
    set({ settings: { ...DEFAULT_SETTINGS } });
  },
}));

/** 清空全部订单（设置页调用） */
export async function clearAllOrders(): Promise<void> {
  await idbClear('orders');
  localStorage.removeItem(CURRENT_KEY);
}
