import { Curve, Vector3 } from 'three'
import type { Vec2 } from '../types'

/**
 * 精确折线曲线：TubeGeometry 沿此曲线生成管体。
 * 不用 CatmullRom——样条会在尖角处过冲，破坏最小弯管半径约束；
 * 圆角已在几何预处理阶段用真实圆弧完成，这里必须 1:1 还原折线。
 *
 * getPoint(u) 用前缀长度 + 二分查找做弧长参数化。
 */
export class PolylineCurve3 extends Curve<Vector3> {
  pts: Vector3[]
  private cum: number[] = []
  private total = 0
  readonly closed: boolean

  constructor(points2d: Vec2[], z: number, closed: boolean) {
    super()
    this.closed = closed
    this.pts = points2d.map((p) => new Vector3(p.x, p.y, z))
    let acc = 0
    this.cum = [0]
    for (let i = 0; i < this.pts.length - 1; i++) {
      acc += this.pts[i].distanceTo(this.pts[i + 1])
      this.cum.push(acc)
    }
    if (closed && this.pts.length > 2) {
      acc += this.pts[this.pts.length - 1].distanceTo(this.pts[0])
    }
    this.total = acc
  }

  getPoint(t: number, target = new Vector3()): Vector3 {
    if (this.pts.length === 1) return target.copy(this.pts[0])
    const d = Math.min(1, Math.max(0, t)) * this.total
    // 二分定位线段
    let lo = 0, hi = this.cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.cum[mid] < d) lo = mid + 1
      else hi = mid
    }
    const i = Math.max(0, lo - 1)
    const segLen = this.cum[i + 1] - this.cum[i]
    const local = segLen > 1e-12 ? (d - this.cum[i]) / segLen : 0
    const a = this.pts[i]
    const b = this.pts[Math.min(i + 1, this.pts.length - 1)]
    return target.set(
      a.x + (b.x - a.x) * local,
      a.y + (b.y - a.y) * local,
      a.z + (b.z - a.z) * local,
    )
  }

  getLength(): number {
    return this.total
  }
}
