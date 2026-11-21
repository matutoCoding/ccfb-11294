import type { Vec2 } from '../types'
import { samplePathD, type RawContour } from './textToPath'
import { bbox } from './vector'

interface Matrix { a: number; b: number; c: number; d: number; e: number; f: number }
const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export interface SvgItem {
  d: string
  closed: boolean
  matrix: Matrix
}

export interface SvgParseResult {
  items: SvgItem[]
  vbW: number
  vbH: number
}

export interface PolylineContour {
  points: Vec2[]
  closed: boolean
}

/**
 * 解析 SVG 文件为若干几何元素：
 * - 支持 path/rect/circle/ellipse/polygon/polyline/line
 * - 支持 viewBox 等比映射、translate/scale/matrix/rotate 变换（<g> 连乘）
 * - 变换以矩阵形式随元素携带，在采样阶段对点施加（svg-path-properties 不识别 transform 命令）
 */
export function parseSvg(svgText: string): SvgParseResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName === 'parsererror' || root.querySelector('parsererror')) throw new Error('SVG 解析失败')

  const vb = root.getAttribute('viewBox')
  let vbW: number, vbH: number
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number)
    ;[, , vbW, vbH] = parts
  } else {
    vbW = parseFloat(root.getAttribute('width') ?? '100') || 100
    vbH = parseFloat(root.getAttribute('height') ?? '100') || 100
  }

  const items: SvgItem[] = []
  const walk = (el: Element, parent: Matrix) => {
    const m = multiply(parent, parseTransform(el.getAttribute('transform')))
    const tag = el.tagName.toLowerCase()
    const d = elementToPath(el, tag)
    if (d) items.push({ d, closed: tag !== 'line' && tag !== 'polyline', matrix: m })
    for (const child of Array.from(el.children)) walk(child, m)
  }
  for (const child of Array.from(root.children)) walk(child, IDENTITY)

  if (!items.length) throw new Error('SVG 中没有可识别的图形元素（支持 path/rect/circle/ellipse/polygon/line）')
  return { items, vbW, vbH }
}

/** 采样 + 仿射变换 + viewBox→mm 等比缩放 + y 翻转 + 居中，输出 mm 坐标折线 */
export function sampleSvgItems(result: SvgParseResult, targetWidthMM: number, spacingMM: number): PolylineContour[] {
  const s = targetWidthMM / result.vbW
  // viewBox → mm：x' = s*x, y' = -s*y（SVG y 向下 → 场景 y 向上）
  const toMM: Matrix = { a: s, b: 0, c: 0, d: -s, e: 0, f: 0 }

  const sampled = result.items.map((item) => {
    const m = multiply(toMM, item.matrix)
    const points = samplePathD(item.d, spacingMM).map((p) => applyMatrix(m, p))
    return { points, closed: item.closed }
  }).filter((c) => c.points.length >= 2)

  // 按整体内容包围盒居中到原点
  const all: Vec2[] = sampled.flatMap((c) => c.points)
  const b = bbox(all)
  return sampled.map((c) => ({
    closed: c.closed,
    points: c.points.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy })),
  }))
}

function applyMatrix(m: Matrix, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
}

function elementToPath(el: Element, tag: string): string | null {
  const num = (name: string, def = 0) => parseFloat(el.getAttribute(name) ?? String(def)) || def
  switch (tag) {
    case 'path':
      return el.getAttribute('d')
    case 'rect': {
      const x = num('x'), y = num('y'), w = num('width'), h = num('height'), r = num('rx', num('ry', 0))
      if (r > 0) {
        return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(w - 2 * r)}a${r},${r} 0 0 1 ${-r},${-r}v${-(h - 2 * r)}a${r},${r} 0 0 1 ${r},${-r}Z`
      }
      return `M${x},${y}h${w}v${h}h${-w}Z`
    }
    case 'circle': {
      const cx = num('cx'), cy = num('cy'), r = num('r')
      return `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`
    }
    case 'ellipse': {
      const cx = num('cx'), cy = num('cy'), rx = num('rx'), ry = num('ry')
      return `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${rx * 2},0a${rx},${ry} 0 1,0 ${-rx * 2},0Z`
    }
    case 'polygon':
    case 'polyline': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number)
      if (pts.length < 4) return null
      let d = `M${pts[0]},${pts[1]}`
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]},${pts[i + 1]}`
      if (tag === 'polygon') d += 'Z'
      return d
    }
    case 'line':
      return `M${num('x1')},${num('y1')}L${num('x2')},${num('y2')}`
    default:
      return null
  }
}

function multiply(p: Matrix, l: Matrix): Matrix {
  return {
    a: p.a * l.a + p.c * l.b,
    b: p.b * l.a + p.d * l.b,
    c: p.a * l.c + p.c * l.d,
    d: p.b * l.c + p.d * l.d,
    e: p.a * l.e + p.c * l.f + p.e,
    f: p.b * l.e + p.d * l.f + p.f,
  }
}

/** 解析 transform 属性为矩阵（translate/scale/rotate/matrix） */
function parseTransform(t: string | null): Matrix {
  if (!t) return { ...IDENTITY }
  const m = t.match(/matrix\(([^)]+)\)/)
  if (m) {
    const n = m[1].split(/[\s,]+/).map(Number)
    return { a: n[0], b: n[1], c: n[2], d: n[3], e: n[4], f: n[5] }
  }
  let r = { ...IDENTITY }
  const tr = t.match(/translate\(([^)]+)\)/)
  if (tr) {
    const n = tr[1].split(/[\s,]+/).map(Number)
    r = { ...r, e: n[0], f: n[1] ?? 0 }
  }
  const sc = t.match(/scale\(([^)]+)\)/)
  if (sc) {
    const n = sc[1].split(/[\s,]+/).map(Number)
    const sy = n[1] ?? n[0]
    r = { a: r.a * n[0], b: r.b * n[0], c: r.c * sy, d: r.d * sy, e: r.e, f: r.f }
  }
  const ro = t.match(/rotate\(([^)]+)\)/)
  if (ro) {
    const ang = (parseFloat(ro[1]) * Math.PI) / 180
    const cos = Math.cos(ang), sin = Math.sin(ang)
    r = {
      a: r.a * cos + r.c * sin,
      b: r.b * cos + r.d * sin,
      c: r.a * -sin + r.c * cos,
      d: r.b * -sin + r.d * cos,
      e: r.e, f: r.f,
    }
  }
  return r
}

/** 供文字管线复用：path data 轮廓的统一形状 */
export type { RawContour }
