// 报价与功率核算验证
import { calcQuote } from '../src/lib/quote'
import { DEFAULT_ANIMATION, DEFAULT_BOARD, DEFAULT_QUOTE } from '../src/lib/presets'
import type { Order, NeonStroke } from '../src/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

const mkStroke = (lenMM: number, visible = true): NeonStroke => ({
  id: Math.random().toString(36).slice(2),
  name: 't', points: [], closed: false, colorId: 'x', tubeDiameter: 8,
  animation: 'steady', faultRange: { from: 0, to: 1 }, visible, length: lenMM,
})

const base: Order = {
  id: 'o1', code: 'NS-TEST', customer: '测试客户', note: '', status: 'draft',
  createdAt: 0, updatedAt: 0,
  board: { ...DEFAULT_BOARD, width: 1000, height: 500 },
  strokes: [mkStroke(3000), mkStroke(2000), mkStroke(1000, false)],
  animation: { ...DEFAULT_ANIMATION },
  quote: { ...DEFAULT_QUOTE },
  warnings: [],
}

const qb = calcQuote(base)
check('总长只统计可见灯管（3+2=5m，隐藏的 1m 不计）', Math.abs(qb.totalLengthM - 5) < 1e-9, `got ${qb.totalLengthM}`)
check('负载 = 5m × 60W = 300W', Math.abs(qb.tubeLoadW - 300) < 1e-9)
check('变压器含 1.25 冗余 = 375W，向上取规格 450W', qb.transformerW === 450, `got ${qb.transformerW}`)
check('背板面积 = 0.5m²', Math.abs(qb.boardAreaSqm - 0.5) < 1e-9)
const expectedTotal = 5 * 120 + 450 * 1.2 + 0.5 * 380 + 200
check('合计费用正确', Math.abs(qb.total - expectedTotal) < 1e-6, `got ${qb.total} want ${expectedTotal}`)

// 空订单不崩
const empty = calcQuote({ ...base, strokes: [] })
check('空订单报价为 0 + 背板 + 固定费', empty.totalLengthM === 0 && empty.transformerW === 30)

// 超大负载走到 RATINGS 表外
const big = calcQuote({ ...base, strokes: [mkStroke(50000)] })
check('超大负载向上取整到 500 的倍数', big.transformerW >= 50 * 60 * 1.25 && big.transformerW % 500 === 0, `got ${big.transformerW}`)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
