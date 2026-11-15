// 全局数据模型

export interface Vec2 {
  x: number;
  y: number;
}

export interface TextSource {
  type: 'text';
  text: string;
  fontFamily: string;
  bold: boolean;
  fontSizeMm: number;
  letterSpacingMm: number;
}

export interface SvgSource {
  type: 'svg';
  svg: string;
  fileName?: string;
  /** 排管方式：contour 沿轮廓（适合实心 logo），skeleton 沿中轴 */
  traceMode?: 'contour' | 'skeleton';
}

export type DesignSource = TextSource | SvgSource;

export type BoardMaterialKind = 'acrylic' | 'metal' | 'wood';

export interface BoardConfig {
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  material: BoardMaterialKind;
  color: string;
  wallColor: string;
  wallDistanceMm: number;
}

export interface BrokenSegment {
  startT: number; // 0..1
  endT: number; // 0..1
}

export interface TubeRun {
  id: string;
  order: number;
  /** 背板平面坐标，单位 mm，原点为背板中心，y 轴向上 */
  points: Vec2[];
  colorId: string;
  diameterMm: number;
  lengthMm: number;
  /** 该路径上实际达到的最小弯管半径 mm */
  minRadiusMm: number;
  /** 是否闭合环（如字母 O） */
  closed: boolean;
  broken: BrokenSegment | null;
}

export type FlickerMode = 'steady' | 'flicker' | 'chase' | 'broken';

export interface AnimationConfig {
  mode: FlickerMode;
  speed: number; // 全局速度倍率
  flickerHz: number; // 闪烁基准频率
  chaseCycleSec: number; // 流水一个周期秒数
  intensity: number; // 0.3..1.2
}

export type IssueKind =
  | 'self-intersection'
  | 'min-radius'
  | 'overlap'
  | 'off-board'
  | 'short-spur';

export interface ValidationIssue {
  id: string;
  kind: IssueKind;
  severity: 'error' | 'warning';
  runId?: string;
  point?: Vec2;
  message: string;
  autoFixable: boolean;
}

export interface Order {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  source: DesignSource;
  board: BoardConfig;
  bendMinRadiusMm: number;
  spacingMm: number;
  runs: TubeRun[];
  animation: AnimationConfig;
  note?: string;
}

export interface NeonColorPreset {
  id: string;
  name: string;
  /** 气体 / 荧光粉工艺说明 */
  process: string;
  core: string;
  glow: string;
  /** 元 / 米 */
  pricePerMeter: number;
}

export interface AppSettings {
  defaultBendRadiusMm: number;
  defaultTubeDiameterMm: number;
  defaultBoardWidthMm: number;
  defaultBoardHeightMm: number;
  bloomStrength: number;
  quality: 'auto' | 'low' | 'high';
  laborPerMeter: number;
  acrylicPerM2: number;
  metalPerM2: number;
  woodPerM2: number;
  transformerWattPerMeter: number;
  transformerMaxWatt: number;
  transformerUnitPrice: number;
  electrodeUnitPrice: number;
  taxRate: number;
  currency: string;
}

export interface QuoteLine {
  label: string;
  spec: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface QuoteResult {
  lines: QuoteLine[]
  subtotal: number;
  tax: number;
  total: number;
  totalLengthMm: number;
  totalWatt: number;
  transformerCount: number;
}
