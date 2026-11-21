import type { NeonColorPreset } from '../types'

/**
 * 真实霓虹灯管颜色：
 * - gas：充气气体本身的发射光谱色（氖红、氩蓝等）
 * - phosphor：充氩汞 + 管壁荧光粉涂层，粉决定出射色
 * glass 为未点亮时管体的 tint（荧光粉管近似乳白，纯气管带淡色透明感）
 */
export const BUILTIN_COLORS: NeonColorPreset[] = [
  { id: 'neon-red', name: '氖气红', glow: '#ff2d3d', glass: '#ff6a72', source: 'gas' },
  { id: 'neon-orange', name: '氖气橙红', glow: '#ff5a1f', glass: '#ff8f5e', source: 'gas' },
  { id: 'argon-blue', name: '氩气蓝', glow: '#2f6bff', glass: '#7fa0ff', source: 'gas' },
  { id: 'argon-cyan', name: '氩青', glow: '#27d8ff', glass: '#8eeaff', source: 'gas' },
  { id: 'he-gold', name: '氦气金', glow: '#ffc02e', glass: '#ffe09a', source: 'gas' },
  { id: 'phos-warm-white', name: '暖白荧光粉', glow: '#ffe6b8', glass: '#e8e2d4', source: 'phosphor' },
  { id: 'phos-white', name: '冷白荧光粉', glow: '#d8ecff', glass: '#dce4ec', source: 'phosphor' },
  { id: 'phos-pink', name: '粉红荧光粉', glow: '#ff4fb0', glass: '#f2a4cf', source: 'phosphor' },
  { id: 'phos-green', name: '翠绿荧光粉', glow: '#35ff7e', glass: '#a6f0c0', source: 'phosphor' },
  { id: 'phos-purple', name: '紫罗兰荧光粉', glow: '#b14bff', glass: '#d3a8f5', source: 'phosphor' },
  { id: 'phos-yellow', name: '柠檬黄荧光粉', glow: '#f4ff4a', glass: '#f2f8b0', source: 'phosphor' },
  { id: 'phos-ice-blue', name: '冰蓝荧光粉', glow: '#7df0ff', glass: '#c2eef2', source: 'phosphor' },
]

export const DEFAULT_QUOTE = {
  pricePerMeter: 120,
  pricePerWatt: 1.2,
  boardPricePerSqm: 380,
  fixedFee: 200,
  transformerMargin: 1.25,
}

export const DEFAULT_BOARD = {
  width: 1200,
  height: 400,
  thickness: 20,
  material: 'acrylic' as const,
  finish: 0.5,
  color: '#101318',
  tubeZ: 40,
  cornerRadius: 12,
}

export const DEFAULT_ANIMATION = {
  speed: 1,
  flickerRate: 1,
  chasePeriod: 3,
  faultRate: 1,
}
