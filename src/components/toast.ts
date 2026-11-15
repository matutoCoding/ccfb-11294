import { create } from 'zustand';

export interface ToastItem {
  id: number;
  text: string;
  kind: 'ok' | 'err' | 'info';
}

interface ToastStore {
  toasts: ToastItem[];
  push: (text: string, kind?: ToastItem['kind']) => void;
  remove: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => get().remove(id), 3200);
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function useToast() {
  return useToastStore((s) => s.push);
}
