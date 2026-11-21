import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { Order } from '../types'
import { DEFAULT_ANIMATION, DEFAULT_BOARD, DEFAULT_QUOTE } from '../lib/presets'

interface OrderState {
  orders: Order[]
  currentId: string | null
  create: (partial?: Partial<Order>) => string
  update: (id: string, patch: Partial<Order>) => void
  remove: (id: string) => void
  duplicate: (id: string) => string
  select: (id: string | null) => void
  importOrders: (orders: Order[]) => number
  replaceAll: (orders: Order[]) => void
  current: () => Order | undefined
}

function makeOrder(partial?: Partial<Order>): Order {
  const now = Date.now()
  return {
    id: nanoid(10),
    code: `NS-${now.toString(36).toUpperCase().slice(-6)}`,
    customer: '',
    note: '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    board: { ...DEFAULT_BOARD },
    strokes: [],
    animation: { ...DEFAULT_ANIMATION },
    quote: { ...DEFAULT_QUOTE },
    warnings: [],
    ...partial,
  }
}

export const useOrders = create<OrderState>()(
  persist(
    (set, get) => ({
      orders: [],
      currentId: null,

      create: (partial) => {
        const order = makeOrder(partial)
        set((s) => ({ orders: [order, ...s.orders], currentId: order.id }))
        return order.id
      },

      update: (id, patch) =>
        set((s) => ({
          orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: Date.now() } : o)),
        })),

      remove: (id) =>
        set((s) => ({
          orders: s.orders.filter((o) => o.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
        })),

      duplicate: (id) => {
        const src = get().orders.find((o) => o.id === id)
        if (!src) return ''
        const copy = makeOrder({
          ...structuredClone(src),
          id: nanoid(10),
          code: `${src.code}-副本`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          strokes: src.strokes.map((st) => ({ ...st, id: nanoid(10) })),
        })
        set((s) => ({ orders: [copy, ...s.orders], currentId: copy.id }))
        return copy.id
      },

      select: (id) => set({ currentId: id }),

      importOrders: (incoming) => {
        const valid = incoming.filter((o) => o && Array.isArray(o.strokes) && o.board)
        set((s) => ({ orders: [...valid, ...s.orders] }))
        return valid.length
      },

      replaceAll: (orders) => set({ orders }),

      current: () => get().orders.find((o) => o.id === get().currentId),
    }),
    { name: 'neon-orders-v1' },
  ),
)
