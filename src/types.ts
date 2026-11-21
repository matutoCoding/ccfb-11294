// 全局领域类型定义

/** 二维点（设计坐标，单位 mm，背板中心为原点） */
export interface Vec2 {
  x: number
  y: number
}

/** 气体 / 荧光粉颜色预设（真实霓虹气体与涂层颜色） */
export interface NeonColorPreset {
  id: string
  name: string
  /** 气体发光色（线性 sRGB hex） */
  glow: string
  /** 玻璃管体 tint */
  glass: string
  /** 来源：气体或荧光粉 */
  source: 'gas' | 'phosphor'
}

export type TubeAnimMode = 'steady' | 'flicker' | 'chase' | 'fault'

/** 接触不良的管段范围（沿灯管弧长的百分比 0~1） */
export interface FaultRange {
  from: number
  to: number
}

/** 单根灯管（一条笔画 / 一条 SVG 路径） */
export interface NeonStroke {
  id: string
  name: string
  /** 圆角处理后的中心线路径（mm） */
  points: Vec2[]
  closed: boolean
  /** 原始折线长度，用于在半径调整后提示重排 */
  colorId: string
  /** 灯管外径 mm（常见 6/8/10） */
  tubeDiameter: number
  animation: TubeAnimMode
  faultRange: FaultRange
  visible: boolean
  /** 该笔画长度（mm，生成时计算） */
  length: number
}

export type BoardMaterial = 'acrylic' | 'metal' | 'wood'

export interface BoardSpec {
  width: number
  height: number
  thickness: number
  material: BoardMaterial
  /** 亚克力透光/金属粗糙度/木纹深浅 0~1 */
  finish: number
  /** 背板底色 */
  color: string
  /** 灯管中心线距板面高度 mm（管托高度） */
  tubeZ: number
  cornerRadius: number
}

export interface AnimationSpec {
  /** 全局速度倍率 */
  speed: number
  flickerRate: number
  chasePeriod: number
  faultRate: number
}

export interface QuoteSpec {
  /** 每米灯管单价（按管径） */
  pricePerMeter: number
  /** 变压器每瓦单价 */
  pricePerWatt: number
  /** 背板每平方米单价（按材质） */
  boardPricePerSqm: number
  /** 设计/安装等固定费用 */
  fixedFee: number
  /** 变压器负载冗余系数 */
  transformerMargin: number
}

export interface DesignWarning {
  level: 'warn' | 'error'
  strokeId?: string
  message: string
}

export interface Order {
  id: string
  code: string
  customer: string
  note: string
  status: 'draft' | 'quoted' | 'producing' | 'done'
  createdAt: number
  updatedAt: number
  board: BoardSpec
  strokes: NeonStroke[]
  animation: AnimationSpec
  quote: QuoteSpec
  warnings: DesignWarning[]
}

export interface AppSettings {
  /** 弯管最小半径 mm */
  minBendRadius: number
  /** 路径采样间距 mm */
  sampleSpacing: number
  /** 自交检测开关 */
  selfIntersectCheck: boolean
  bloomStrength: number
  bloomRadius: number
  /** 辉光分辨率比例 0.5 / 0.75 / 1 */
  bloomResolution: number
  haloDensity: number
  /** 颜色预设（内置 + 自定义） */
  colorPresets: NeonColorPreset[]
  customFonts: { id: string; name: string; dataUrl: string }[]
}
