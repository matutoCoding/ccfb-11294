import * as opentype from 'opentype.js'
import { svgPathProperties } from 'svg-path-properties'
import type { Vec2 } from '../types'
import { bbox, dedupe } from './vector'

export interface RawContour {
  /** 未采样时的 path data；points 存在时优先使用已采样折线 */
  d?: string
  points?: Vec2[]
  closed: boolean
}

/**
 * 用 opentype.js 把文字转成等弧长采样的 mm 坐标折线。
 * 一个字形可能含多个子轮廓（如 O 的外环 + 内环），按 M 命令拆开后各自采样。
 * 坐标换算到 mm 并整体居中到原点，按目标宽度等比缩放。
 */
export function textToContours(
  font: opentype.Font,
  text: string,
  targetWidthMM: number,
  options: { letterSpacing?: number } = {},
): RawContour[] {
  if (!text.trim()) return []
  const fontSize = 100 // 字体单位基准，最后统一缩放到 mm
  const spacing = (options.letterSpacing ?? 0) * fontSize
  const path = font.getPath(text, 0, 0, fontSize, { letterSpacing: spacing })
  const fullD = path.toPathData(2)
  const subpaths = splitSubpaths(fullD)

  // 先在字体坐标采样（y 向上为正、baseline 在 0），再对采样点做仿射：
  // 不走 path data 文本替换——h/a 等命令的参数个数不固定，文本配对会错位
  const fontPts = subpaths.map((c) => samplePathD(c.d!, 1))
  const allPts = fontPts.flat()
  if (!allPts.length) return []
  const b = bbox(allPts)
  const scaleMM = targetWidthMM / Math.max(b.w, 1e-6)

  return subpaths.map((c, i) => ({
    closed: c.closed,
    // 采样点直接变换：x 居中缩放，y 取反（字体 y 向上 → 场景 y 向上但基线翻转）后居中
    points: fontPts[i].map((p) => ({
      x: (p.x - b.cx) * scaleMM,
      y: -(p.y - b.cy) * scaleMM,
    })),
  }))
}

function splitSubpaths(d: string): RawContour[] {
  const matches = [...d.matchAll(/([Mm])([^Mm]*)/g)]
  return matches.map((m) => {
    const body = m[0]
    const closed = /[zZ]\s*$/.test(body.trim()) || body.includes('Z') || body.includes('z')
    return { d: body, closed }
  })
}

/** 等弧长采样一条 path data 为 mm 坐标折线 */
export function samplePathD(d: string, spacingMM: number): Vec2[] {
  const props = new svgPathProperties(d)
  const total = props.getTotalLength()
  const steps = Math.max(4, Math.ceil(total / spacingMM))
  const pts: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    pts.push(props.getPointAtLength((total * i) / steps))
  }
  return dedupe(pts)
}

export async function loadFontFromUrl(url: string): Promise<opentype.Font> {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  return opentype.parse(buf)
}

export async function loadFontFromFile(file: File): Promise<{ font: opentype.Font; name: string; dataUrl: string }> {
  const buf = await file.arrayBuffer()
  const font = opentype.parse(buf.slice(0))
  const dataUrl = await fileToDataUrl(file)
  return { font, name: file.name.replace(/\.(ttf|otf)$/i, ''), dataUrl }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
