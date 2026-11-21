import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings } from '../types'
import { BUILTIN_COLORS, DEFAULT_ANIMATION, DEFAULT_BOARD, DEFAULT_QUOTE } from '../lib/presets'

interface SettingsState extends AppSettings {
  set: (patch: Partial<AppSettings>) => void
  addColor: (color: AppSettings['colorPresets'][number]) => void
  removeColor: (id: string) => void
  addCustomFont: (font: { id: string; name: string; dataUrl: string }) => void
  removeCustomFont: (id: string) => void
}

const initial: AppSettings = {
  minBendRadius: 12,
  sampleSpacing: 4,
  selfIntersectCheck: true,
  bloomStrength: 1.15,
  bloomRadius: 0.7,
  bloomResolution: 0.75,
  haloDensity: 1,
  colorPresets: BUILTIN_COLORS,
  customFonts: [],
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...initial,
      set: (patch) => set(patch),
      addColor: (color) => set((s) => ({ colorPresets: [...s.colorPresets, color] })),
      removeColor: (id) => set((s) => ({ colorPresets: s.colorPresets.filter((c) => c.id !== id) })),
      addCustomFont: (font) => set((s) => ({ customFonts: [...s.customFonts.filter((f) => f.id !== font.id), font] })),
      removeCustomFont: (id) => set((s) => ({ customFonts: s.customFonts.filter((f) => f.id !== id) })),
    }),
    { name: 'neon-settings-v1' },
  ),
)

export { DEFAULT_BOARD, DEFAULT_ANIMATION, DEFAULT_QUOTE }
