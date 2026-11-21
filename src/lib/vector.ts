import type { Vec2 } from '../types'

export const v = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })

export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

export const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y)
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** 两条边方向（均沿行进方向）之间的偏转角 0~π，0=直行，π=掉头 */
export function deflectionAngle(prevDir: Vec2, nextDir: Vec2): number {
  const p = norm(prevDir)
  const n = norm(nextDir)
  const cos = Math.min(1, Math.max(-1, p.x * n.x + p.y * n.y))
  return Math.acos(cos)
}

export function polylineLength(points: Vec2[], closed: boolean): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += dist(points[i], points[i + 1])
  if (closed && points.length > 2) total += dist(points[points.length - 1], points[0])
  return total
}

/** 去除重复/极近点 */
export function dedupe(points: Vec2[], eps = 1e-6): Vec2[] {
  const out: Vec2[] = []
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p)
  }
  return out
}

export function bbox(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number; w: number; h: number; cx: number; cy: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}
