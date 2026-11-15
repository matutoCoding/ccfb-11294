import type { AppSettings, BoardConfig, NeonColorPreset, Order, AnimationConfig } from './types';

// 真实霓虹工艺配色：充气管（氖/氩）与荧光粉管
export const NEON_COLORS: NeonColorPreset[] = [
  { id: 'neon-red', name: '霓虹红', process: '充氖气 · 透明玻璃管', core: '#ff2a3c', glow: '#ff5548', pricePerMeter: 22 },
  { id: 'neon-orange', name: '橙红', process: '氖氩混合气 · 荧光粉管', core: '#ff6a28', glow: '#ff8a3d', pricePerMeter: 24 },
  { id: 'neon-gold', name: '金黄', process: '氩汞 · 黄色荧光粉', core: '#ffc53a', glow: '#ffd76b', pricePerMeter: 26 },
  { id: 'neon-warm-white', name: '暖白', process: '氩汞 · 暖白荧光粉', core: '#ffe9c4', glow: '#ffd9a0', pricePerMeter: 26 },
  { id: 'neon-green', name: '翠绿', process: '氩汞 · 绿色荧光粉', core: '#2dff8f', glow: '#63ffb0', pricePerMeter: 28 },
  { id: 'neon-cyan', name: '青蓝', process: '氩汞 · 青色荧光粉', core: '#28e6ee', glow: '#6ff4ff', pricePerMeter: 28 },
  { id: 'neon-blue', name: '宝蓝', process: '氩汞 · 蓝色荧光粉', core: '#3a72ff', glow: '#6f9bff', pricePerMeter: 28 },
  { id: 'neon-purple', name: '紫罗兰', process: '氩汞 · 紫色荧光粉', core: '#a45cff', glow: '#c195ff', pricePerMeter: 30 },
  { id: 'neon-pink', name: '粉红', process: '氩汞 · 红色荧光粉', core: '#ff5cc8', glow: '#ff8fdb', pricePerMeter: 30 },
  { id: 'neon-cool-white', name: '冷白', process: '氩汞 · 三基色荧光粉', core: '#e8f6ff', glow: '#bfe6ff', pricePerMeter: 26 },
];

export function colorById(id: string): NeonColorPreset {
  return NEON_COLORS.find((c) => c.id === id) ?? NEON_COLORS[0];
}

export const TUBE_DIAMETERS_MM = [6, 8, 10, 12];

export const BOARD_MATERIALS = [
  { id: 'acrylic' as const, name: '亚克力', roughness: 0.22, metalness: 0 },
  { id: 'metal' as const, name: '金属板', roughness: 0.38, metalness: 0.85 },
  { id: 'wood' as const, name: '木纹板', roughness: 0.7, metalness: 0 },
];

export const SYSTEM_FONTS = [
  'Microsoft YaHei',
  'SimHei',
  'SimSun',
  'KaiTi',
  'FangSong',
  'Microsoft JhengHei',
  'PingFang SC',
  'Hiragino Sans GB',
  'Noto Sans SC',
  'Source Han Sans SC',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Impact',
  'Courier New',
];

export const DEFAULT_SETTINGS: AppSettings = {
  defaultBendRadiusMm: 20,
  defaultTubeDiameterMm: 8,
  defaultBoardWidthMm: 800,
  defaultBoardHeightMm: 400,
  bloomStrength: 0.85,
  quality: 'auto',
  laborPerMeter: 18,
  acrylicPerM2: 380,
  metalPerM2: 460,
  woodPerM2: 320,
  transformerWattPerMeter: 8,
  transformerMaxWatt: 80,
  transformerUnitPrice: 120,
  electrodeUnitPrice: 15,
  taxRate: 0.13,
  currency: '¥',
};

export function defaultBoard(s: AppSettings): BoardConfig {
  return {
    widthMm: s.defaultBoardWidthMm,
    heightMm: s.defaultBoardHeightMm,
    thicknessMm: 20,
    material: 'acrylic',
    color: '#101216',
    wallColor: '#17191d',
    wallDistanceMm: 60,
  };
}

export const DEFAULT_ANIMATION: AnimationConfig = {
  mode: 'steady',
  speed: 1,
  flickerHz: 9,
  chaseCycleSec: 2.4,
  intensity: 1,
};

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}_${counter}`;
}

export function createOrder(name: string, settings: AppSettings): Order {
  const now = Date.now();
  return {
    id: uid('order'),
    name,
    createdAt: now,
    updatedAt: now,
    source: {
      type: 'text',
      text: '霓虹',
      fontFamily: 'Microsoft YaHei',
      bold: true,
      fontSizeMm: 180,
      letterSpacingMm: 30,
    },
    board: defaultBoard(settings),
    bendMinRadiusMm: settings.defaultBendRadiusMm,
    spacingMm: 14,
    runs: [],
    animation: { ...DEFAULT_ANIMATION },
  };
}
