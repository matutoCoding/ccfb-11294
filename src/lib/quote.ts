import type { BoardSpec, NeonStroke, Order, QuoteSpec } from '../types'

export interface QuoteBreakdown {
  totalLengthMM: number
  totalLengthM: number
  strokeCount: number
  /** 估算负载 W：霓虹管约 60W/m（含电极损耗的工程经验值） */
  tubeLoadW: number
  /** 变压器额定功率（含冗余，向上取整到常见规格） */
  transformerW: number
  boardAreaSqm: number
  tubeCost: number
  transformerCost: number
  boardCost: number
  fixedCost: number
  total: number
  currency: string
}

const WATT_PER_METER = 60
const RATINGS = [30, 60, 100, 150, 200, 300, 450, 600, 800, 1000]

export function calcQuote(order: Order): QuoteBreakdown {
  const strokes = order.strokes.filter((s) => s.visible)
  const totalLengthMM = strokes.reduce((sum, s) => sum + s.length, 0)
  const totalLengthM = totalLengthMM / 1000
  const q: QuoteSpec = order.quote
  const b: BoardSpec = order.board

  const tubeLoadW = totalLengthM * WATT_PER_METER
  const needed = tubeLoadW * q.transformerMargin
  const transformerW = RATINGS.find((r) => r >= needed) ?? Math.ceil(needed / 500) * 500

  const boardAreaSqm = (b.width * b.height) / 1e6
  const tubeCost = totalLengthM * q.pricePerMeter
  const transformerCost = transformerW * q.pricePerWatt
  const boardCost = boardAreaSqm * q.boardPricePerSqm
  const fixedCost = q.fixedFee
  const total = tubeCost + transformerCost + boardCost + fixedCost

  return {
    totalLengthMM,
    totalLengthM,
    strokeCount: strokes.length,
    tubeLoadW,
    transformerW,
    boardAreaSqm,
    tubeCost,
    transformerCost,
    boardCost,
    fixedCost,
    total,
    currency: 'CNY',
  }
}

export function fmtMoney(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function buildQuoteText(order: Order, qb: QuoteBreakdown): string {
  const lines = [
    `霓虹灯牌报价单`,
    `订单编号：${order.code}`,
    `客户：${order.customer}`,
    `生成日期：${new Date().toLocaleDateString('zh-CN')}`,
    ``,
    `背板：${order.board.width}×${order.board.height}mm（${materialName(order.board.material)}）`,
    `灯管数量：${qb.strokeCount} 根`,
    `灯管总长：${qb.totalLengthM.toFixed(2)} m`,
    `估算负载：${qb.tubeLoadW.toFixed(0)} W`,
    `变压器配置：${qb.transformerW} W（含 ${(order.quote.transformerMargin * 100).toFixed(0)}% 冗余）`,
    ``,
    `灯管费用：${fmtMoney(qb.tubeCost)}`,
    `变压器：${fmtMoney(qb.transformerCost)}`,
    `背板：${fmtMoney(qb.boardCost)}`,
    `固定费用：${fmtMoney(qb.fixedCost)}`,
    `合计：${fmtMoney(qb.total)}`,
  ]
  return lines.join('\n')
}

export function materialName(m: BoardSpec['material']): string {
  return m === 'acrylic' ? '亚克力' : m === 'metal' ? '金属' : '木纹'
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function strokeColorOf(stroke: NeonStroke, presets: { id: string; glow: string }[]): string {
  return presets.find((p) => p.id === stroke.colorId)?.glow ?? '#ff2d3d'
}
