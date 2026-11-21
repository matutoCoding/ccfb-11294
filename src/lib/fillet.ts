import type { Vec2 } from '../types'
import { bbox, deflectionAngle, dist, dedupe, norm } from './vector'

export interface IntersectionHit {
  segA: number
  segB: number
  point: Vec2
}

/**
 * 空间哈希加速的折线自交检测，O(n) 平均复杂度。
 * 只检测不相邻的边；相邻边共享端点属正常连接。
 */
export function findSelfIntersections(points: Vec2[], closed: boolean): IntersectionHit[] {
  const pts = dedupe(points, 1e-7)
  const n = pts.length
  if (n < 3) return []
  const edges: [Vec2, Vec2, number][] = []
  let cell = 0
  for (let i = 0; i < n - 1; i++) {
    edges.push([pts[i], pts[i + 1], i])
    cell = Math.max(cell, dist(pts[i], pts[i + 1]))
  }
  if (closed) {
    edges.push([pts[n - 1], pts[0], n - 1])
    cell = Math.max(cell, dist(pts[n - 1], pts[0]))
  }
  if (cell <= 1e-9) return []

  const grid = new Map<string, number[]>()
  const key = (cx: number, cy: number) => `${cx}|${cy}`
  const cellOf = (p: Vec2) => [Math.floor(p.x / cell), Math.floor(p.y / cell)]

  edges.forEach(([a, b], idx) => {
    const [x0, y0] = cellOf(a)
    const [x1, y1] = cellOf(b)
    for (let cx = Math.min(x0, x1); cx <= Math.max(x0, x1); cx++) {
      for (let cy = Math.min(y0, y1); cy <= Math.max(y0, y1); cy++) {
        const k = key(cx, cy)
        const arr = grid.get(k)
        if (arr) arr.push(idx)
        else grid.set(k, [idx])
      }
    }
  })

  const hits: IntersectionHit[] = []
  const seen = new Set<string>()
  const adjacent = (i: number, j: number) => {
    if (Math.abs(i - j) === 1) return true
    if (closed && i === 0 && j === edges.length - 1) return true
    return false
  }

  const segIntersect = (a: Vec2, b: Vec2, c: Vec2, d: Vec2, touchTol = 3): Vec2 | null => {
    const rx = b.x - a.x, ry = b.y - a.y
    const sx = d.x - c.x, sy = d.y - c.y
    const lr = Math.hypot(rx, ry), ls = Math.hypot(sx, sy)
    if (lr < 1e-9 || ls < 1e-9) return null
    const rxs = rx * sy - ry * sx
    // 自适应阈值：叉积按两边长度归一化，夹角小于约 0.006° 的近共线边不算交叉
    if (Math.abs(rxs) < lr * ls * 1e-4) return null
    const qpx = c.x - a.x, qpy = c.y - a.y
    const t = (qpx * sy - qpy * sx) / rxs
    const u = (qpx * ry - qpy * rx) / rxs
    const epsT = 1e-5
    if (t < epsT || t > 1 - epsT || u < epsT || u > 1 - epsT) return null
    const hit = { x: a.x + rx * t, y: a.y + ry * t }
    // 近接触规则 1：交点在任一端点的 touchTol（约半个管径）内，视为发夹/电极连接
    const near = [a, b, c, d].some((p) => dist(p, hit) < touchTol)
    if (near) return null
    // 近接触规则 2：仅对近平行边（夹角 <5°）启用——平行双线/描边装饰在该角度下
    // 间距小于管径，物理上不可能是独立灯管；大角度真交叉不受此规则影响
    const sinAngle = Math.abs(rxs) / (lr * ls)
    if (sinAngle < 0.087) {
      const band = (p: Vec2, p0: Vec2, p1: Vec2) => {
        const dx = p1.x - p0.x, dy = p1.y - p0.y
        const l2 = dx * dx + dy * dy
        const tt = Math.max(0, Math.min(1, ((p.x - p0.x) * dx + (p.y - p0.y) * dy) / l2))
        return dist(p, { x: p0.x + tt * dx, y: p0.y + tt * dy })
      }
      if (band(hit, a, b) < touchTol || band(hit, c, d) < touchTol) return null
    }
    return hit
  }

  for (const bucket of grid.values()) {
    for (let ai = 0; ai < bucket.length; ai++) {
      for (let bi = ai + 1; bi < bucket.length; bi++) {
        const i = bucket[ai], j = bucket[bi]
        if (adjacent(i, j)) continue
        const pair = i < j ? `${i}-${j}` : `${j}-${i}`
        if (seen.has(pair)) continue
        seen.add(pair)
        const [a, b] = edges[i]
        const [c, d] = edges[j]
        const hit = segIntersect(a, b, c, d)
        if (hit) hits.push({ segA: edges[i][2], segB: edges[j][2], point: hit })
      }
    }
  }
  return hits
}

export interface FilletWarning {
  message: string
  achievedRadius: number
}

export interface FilletResult {
  points: Vec2[]
  closed: boolean
  warnings: FilletWarning[]
}

const STRAIGHT_ANGLE = 0.03 // 偏转角小于 ~1.7° 视为直边，不做圆角（抑制采样噪声）

/** 点到线段距离 */
function perpDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 < 1e-12) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Douglas-Peucker 折线抽稀。
 * 容差取 rMin 的 1/4：保留所有显著几何特征，去掉密集采样产生的伪转角，
 * 使后续圆角只作用在真实转角上（对应弯管机只在特征点弯折的工艺）。
 */
function simplifyDP(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length < 3) return points
  const keep = new Array(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop()!
    let maxD = -1, idx = -1
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDistance(points[i], points[lo], points[hi])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = true
      stack.push([lo, idx], [idx, hi])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * 最小弯管半径约束的折线圆角算法（霓虹弯管工艺模型）。
 *
 * 几何关系：偏转角 d 的转角以半径 r 做相切圆弧，沿两条邻边各需
 * 切线长 s = r·tan(d/2)。两个硬约束：
 *   1. 同一条边上两个相邻转角的切线长之和 ≤ 边长（迭代松弛）
 *   2. 单个切线长 ≤ 边长的一半（切线点不得越过边中点，否则路径折叠）
 * 约束无法满足时按可达到的最大半径降级，并逐条告警——
 * 这对应实际工艺中“这段太短，弯不了设定半径”的真实反馈。
 */
export function applyMinBendRadius(input: Vec2[], rMin: number, closed: boolean, arcSpacing = 4): FilletResult {
  const raw = dedupe(input)
  const warnings: FilletWarning[] = []
  if (raw.length < 3 || rMin <= 0) return { points: raw, closed, warnings }

  // 先抽稀去除采样伪转角（容差 1.5mm：去噪但保留字形曲线特征），再做特征转角圆角
  const pts = closed ? simplifyClosed(raw, 1.5) : simplifyDP(raw, 1.5)
  const n = pts.length
  if (n < 3) return { points: pts, closed, warnings }

  const edgeCount = closed ? n : n - 1
  const edgeLen: number[] = []
  for (let i = 0; i < edgeCount; i++) edgeLen.push(dist(pts[i], pts[(i + 1) % n]))

  const isCorner = (i: number) => (closed ? true : i > 0 && i < n - 1)
  const deflect: number[] = new Array(n).fill(0)
  const want: number[] = new Array(n).fill(0)
  const skipped = new Set<number>() // 几何空间不足、无法做任何圆角的转角（保留硬折点）
  for (let i = 0; i < n; i++) {
    if (!isCorner(i)) continue
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    const d = deflectionAngle({ x: pts[i].x - prev.x, y: pts[i].y - prev.y }, { x: next.x - pts[i].x, y: next.y - pts[i].y })
    deflect[i] = d
    if (d < STRAIGHT_ANGLE) continue
    want[i] = rMin * Math.tan(d / 2)
  }

  // 约束 2：切线长物理上限 = 两条邻边各自长度的一半
  const cap: number[] = new Array(n).fill(Infinity)
  for (let i = 0; i < n; i++) {
    if (!isCorner(i) || deflect[i] < STRAIGHT_ANGLE) continue
    const inEdge = edgeLen[(i - 1 + edgeCount) % edgeCount]
    const outEdge = edgeLen[closed ? i % edgeCount : i]
    cap[i] = Math.min(inEdge, outEdge) * 0.49
    // 邻边短到连 0.5mm 切线长都放不下：该转角无法圆角，保留硬折点
    if (cap[i] < 0.5) skipped.add(i)
  }
  for (const i of skipped) { want[i] = 0; cap[i] = 0 }

  const s = want.map((w, i) => (skipped.has(i) ? 0 : Math.min(w, Number.isFinite(cap[i]) ? cap[i] : w)))

  // 约束 1：相邻转角争抢同一条边时迭代松弛
  for (let pass = 0; pass < 32; pass++) {
    let violated = false
    for (let e = 0; e < edgeCount; e++) {
      const a = e
      const b = (e + 1) % n
      const need = s[a] + s[b]
      if (need > edgeLen[e] && need > 1e-12) {
        const k = (edgeLen[e] * 0.998) / need
        s[a] *= k
        s[b] *= k
        violated = true
      }
    }
    if (!violated) break
  }

  // 降级告警（跳过的硬折点单独标注工艺含义）
  for (let i = 0; i < n; i++) {
    if (!isCorner(i) || deflect[i] < STRAIGHT_ANGLE) continue
    if (skipped.has(i)) {
      warnings.push({
        message: `转角邻边过短（<1mm），无法弯管，已保留硬折点，建议简化字形或放大该区域`,
        achievedRadius: 0,
      })
      continue
    }
    const achieved = s[i] / Math.tan(deflect[i] / 2)
    if (achieved < rMin - 1e-4) {
      warnings.push({
        message: `转角受相邻边长度限制，实际弯管半径 ${achieved.toFixed(1)}mm（设定最小值 ${rMin}mm），已按可成型的最大半径处理`,
        achievedRadius: achieved,
      })
    }
  }

  // 重建路径：直线段 + 圆弧（硬折点直接输出原顶点，保证路径连续）
  const cornerList: number[] = []
  for (let i = 0; i < n; i++) {
    if (isCorner(i) && deflect[i] >= STRAIGHT_ANGLE) cornerList.push(i)
  }
  const out: Vec2[] = []
  if (!closed) out.push(pts[0])
  const appendSegmentTo = (target: Vec2) => {
    const last = out[out.length - 1]
    if (!last || dist(last, target) > 1e-6) out.push(target)
  }

  cornerList.forEach((i) => {
    const prevIdx = (i - 1 + n) % n
    const nextIdx = (i + 1) % n
    const dirIn = norm({ x: pts[i].x - pts[prevIdx].x, y: pts[i].y - pts[prevIdx].y })
    const dirOut = norm({ x: pts[nextIdx].x - pts[i].x, y: pts[nextIdx].y - pts[i].y })

    // 硬折点：直接连接原顶点
    if (skipped.has(i) || s[i] <= 1e-6) {
      appendSegmentTo(pts[i])
      return
    }

    const tpIn = { x: pts[i].x - dirIn.x * s[i], y: pts[i].y - dirIn.y * s[i] }
    const tpOut = { x: pts[i].x + dirOut.x * s[i], y: pts[i].y + dirOut.y * s[i] }
    appendSegmentTo(tpIn)

    // 圆心在内角平分线上：bisector = 顶点指向两邻点的单位方向之和
    const rEff = s[i] / Math.tan(deflect[i] / 2)
    const bisector = norm({ x: -dirIn.x + dirOut.x, y: -dirIn.y + dirOut.y })
    const centerDist = rEff / Math.sin(deflect[i] / 2)
    const center = { x: pts[i].x + bisector.x * centerDist, y: pts[i].y + bisector.y * centerDist }
    const a0 = Math.atan2(tpIn.y - center.y, tpIn.x - center.x)
    const a1 = Math.atan2(tpOut.y - center.y, tpOut.x - center.x)
    let delta = a1 - a0
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    const sweep = Math.abs(delta)
    const steps = Math.max(2, Math.ceil((rEff * sweep) / arcSpacing))
    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      const a = a0 + delta * t
      out.push({ x: center.x + rEff * Math.cos(a), y: center.y + rEff * Math.sin(a) })
    }
  })

  if (!closed) {
    appendSegmentTo(pts[n - 1])
  } else {
    appendSegmentTo(out[0])
  }

  const result = dedupe(out, 1e-6)
  if (!result.every((p) => isFinite(p.x) && isFinite(p.y)) || result.length < 2) {
    warnings.push({ message: '圆角重建异常，已回退为原始路径', achievedRadius: 0 })
    return { points: raw, closed, warnings }
  }
  // 最终自交保护：圆角结果若产生交叉（极端密集细节），回退到抽稀后的折线（仍去除了采样噪声）
  const finalHits = findSelfIntersections(result, closed)
  if (finalHits.length > findSelfIntersections(raw, closed).length) {
    warnings.push({
      message: `圆角处理引入 ${finalHits.length} 处路径交叉，已回退为简化折线；建议调大采样间距或简化设计细节`,
      achievedRadius: 0,
    })
    return { points: pts, closed, warnings }
  }
  // 包围盒 sanity check：正常圆角只会内缩，尺寸偏差不应超过 25%
  const b0 = bbox(raw), b1 = bbox(result)
  if (Math.abs(b1.w - b0.w) > b0.w * 0.25 + 1 || Math.abs(b1.h - b0.h) > b0.h * 0.25 + 1) {
    warnings.push({ message: '圆角处理后包围盒异常，已回退为原始路径', achievedRadius: 0 })
    return { points: raw, closed, warnings }
  }
  return { points: result, closed, warnings }
}

/** 闭合折线抽稀：在最大边处切开做 DP，再闭合还原 */
function simplifyClosed(points: Vec2[], tolerance: number): Vec2[] {
  let cut = 0, maxLen = -1
  for (let i = 0; i < points.length; i++) {
    const l = dist(points[i], points[(i + 1) % points.length])
    if (l > maxLen) { maxLen = l; cut = i }
  }
  const rotated = [...points.slice(cut + 1), ...points.slice(0, cut + 1)]
  const simplified = simplifyDP(rotated, tolerance)
  return simplified
}
