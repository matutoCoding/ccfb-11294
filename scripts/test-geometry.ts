// 几何核心验证：最小弯管半径、自交检测、弧长参数化
// 运行：npx tsx scripts/test-geometry.ts
import { applyMinBendRadius, findSelfIntersections } from '../src/lib/fillet'
import { PolylineCurve3 } from '../src/lib/polylineCurve'
import { deflectionAngle, polylineLength, sub, type Vec2 } from '../src/lib/vector'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

// 1. 直角折线，rMin=10 → 转角处实际半径不得小于 10（边长足够时应精确等于 10）
{
  const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
  const r = applyMinBendRadius(pts, 10, false)
  check('直角圆角后点数增加', r.points.length > 3, `got ${r.points.length}`)
  check('无告警（边长充足）', r.warnings.length === 0, JSON.stringify(r.warnings))

  // 找最靠近原转角 (100,0) 的采样点，估算其曲率半径
  const cornerRegion = r.points.filter((p) => p.x > 80 && p.y < 20)
  // 圆弧上任意点到圆心距离应 ≈ 10；圆心约在 (90,10) 附近
  const radii = cornerRegion.map((p) => Math.hypot(p.x - 90, p.y - 10))
  const maxDev = Math.max(...radii.map((x) => Math.abs(x - 10)))
  check('圆弧半径 = 10mm（偏差 < 0.6mm）', maxDev < 0.6, `dev=${maxDev.toFixed(3)}`)
}

// 2. 极短边约束：连续两个直角，中间边只有 6mm，rMin=10 → 必须告警且不崩
{
  const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 6 }, { x: 0, y: 6 }]
  const r = applyMinBendRadius(pts, 10, false)
  check('短边冲突产生告警', r.warnings.length > 0)
  check('短边冲突时实际半径 <= 设定值', r.warnings.every((w) => w.achievedRadius <= 10 + 1e-6))
  check('输出仍是合法折线（>=2 点、有限数）', r.points.length >= 2 && r.points.every((p) => isFinite(p.x) && isFinite(p.y)))
}

// 3. 闭合正方形圆角
{
  const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  const r = applyMinBendRadius(pts, 15, true)
  check('闭合路径保持闭合', r.closed === true)
  check('闭合路径无自交', findSelfIntersections(r.points, true).length === 0)
  check('圆角后总长度短于原折线（直线被弧替换）', polylineLength(r.points, true) < polylineLength(pts, true))
}

// 4. 自交检测：蝴蝶结折线
{
  const bowtie: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]
  const hits = findSelfIntersections(bowtie, false)
  check('蝴蝶结自交被检出（1 处）', hits.length === 1, `got ${hits.length}`)
  check('交点位置在中心 (50,50)', Math.abs(hits[0].point.x - 50) < 1e-6 && Math.abs(hits[0].point.y - 50) < 1e-6)

  const square: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  check('普通矩形无自交误报', findSelfIntersections(square, true).length === 0)
}

// 5. PolylineCurve3 弧长参数化单调且总长度正确
{
  const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
  const curve = new PolylineCurve3(pts, 5, false)
  check('曲线总长度 = 200', Math.abs(curve.getLength() - 200) < 1e-6, `got ${curve.getLength()}`)
  let prev = -1
  let monotonic = true
  const samples: { x: number; y: number; z: number }[] = []
  for (let i = 0; i <= 50; i++) {
    const p = curve.getPoint(i / 50)
    samples.push({ x: p.x, y: p.y, z: p.z })
    const d = Math.hypot(p.x, p.y)
    if (d < prev - 1e-9) monotonic = false
    prev = d
  }
  check('getPoint 弧长单调', monotonic)
  check('z 坐标恒定为管托高度', samples.every((p) => Math.abs(p.z - 5) < 1e-9))
  check('起点终点正确', samples[0].x === 0 && samples[50].y === 100)
}

// 6. 圆角后任意相邻三点的转角不出现比 rMin 更急的弯（采样弧长 4mm，近似验证）
{
  const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 60 }, { x: 30, y: 60 }, { x: 30, y: 120 }]
  const r = applyMinBendRadius(pts, 12, false)
  let worstRadius = Infinity
  for (let i = 1; i < r.points.length - 1; i++) {
    const a = sub(r.points[i], r.points[i - 1])
    const b = sub(r.points[i + 1], r.points[i])
    const d = deflectionAngle(a, b)
    if (d > 0.05) {
      // 三点外接圆半径估算
      const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y)
      const lc = Math.hypot(r.points[i + 1].x - r.points[i - 1].x, r.points[i + 1].y - r.points[i - 1].y)
      const area = Math.abs(a.x * b.y - a.y * b.x) / 2
      if (area > 1e-9) {
        const R = (la * lb * lc) / (4 * area)
        worstRadius = Math.min(worstRadius, R)
      }
    }
  }
  check('离散采样最小曲率半径 >= 11mm（容离散误差）', worstRadius >= 11, `worst=${worstRadius.toFixed(2)}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
