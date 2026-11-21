import { nanoid } from 'nanoid'
import type { AppSettings, DesignWarning, NeonStroke, Vec2 } from '../types'
import { applyMinBendRadius, findSelfIntersections } from './fillet'
import { polylineLength } from './vector'
import { samplePathD, type RawContour } from './textToPath'

/** 轮廓输入：可以是未采样的 path data，也可以是已采样的 mm 坐标折线（SVG 管线） */
export type ContourInput = RawContour | { points: Vec2[]; closed: boolean }

export interface BuildInput {
  contours: ContourInput[]
  colorId: string
  tubeDiameter: number
  settings: AppSettings
  namePrefix?: string
}

export interface BuildOutput {
  strokes: NeonStroke[]
  warnings: DesignWarning[]
}

/**
 * 排版生成主管线：
 * 轮廓 path → 等弧长采样折线 → 最小弯管半径圆角 → 自交检测 → NeonStroke
 */
export function buildStrokes(input: BuildInput): BuildOutput {
  const warnings: DesignWarning[] = []
  const strokes: NeonStroke[] = []
  const { minBendRadius, sampleSpacing, selfIntersectCheck } = input.settings
  const { tubeDiameter } = input

  input.contours.forEach((contour, idx) => {
    const sampled = 'points' in contour && contour.points
      ? contour.points
      : samplePathD((contour as { d: string }).d, sampleSpacing)
    if (sampled.length < 2) return
    // 过滤毫米级微小轮廓（字形内孔等，物理上无法穿管），阈值 = 2 倍管径
    const rawLen = polylineLength(sampled, contour.closed)
    if (rawLen < tubeDiameter * 2) {
      warnings.push({ level: 'warn', message: `轮廓 ${idx + 1} 周长仅 ${rawLen.toFixed(1)}mm，小于 2 倍管径（${tubeDiameter * 2}mm），已跳过` })
      return
    }

    const filleted = applyMinBendRadius(sampled, minBendRadius, contour.closed)
    for (const w of filleted.warnings) {
      warnings.push({ level: 'warn', message: `笔画 ${idx + 1}：${w.message}` })
    }

    if (selfIntersectCheck) {
      const hits = findSelfIntersections(filleted.points, filleted.closed)
      if (hits.length) {
        warnings.push({
          level: 'error',
          message: `笔画 ${idx + 1} 检测到 ${hits.length} 处路径自交，实际弯管无法成型，请调整字形/SVG 或加大采样间距`,
        })
      }
    }

    const points: Vec2[] = filleted.points
    strokes.push({
      id: nanoid(10),
      name: `${input.namePrefix ?? '灯管'}-${idx + 1}`,
      points,
      closed: filleted.closed,
      colorId: input.colorId,
      tubeDiameter: input.tubeDiameter,
      animation: 'steady',
      faultRange: { from: 0.6, to: 0.75 },
      visible: true,
      length: polylineLength(points, filleted.closed),
    })
  })

  return { strokes, warnings }
}

/** 设置变化（最小半径/采样间距）后对已有笔画重新做圆角，保留颜色与动画设置 */
export function rebuildStrokeGeometry(stroke: NeonStroke, settings: AppSettings): { stroke: NeonStroke; warnings: DesignWarning[] } {
  const warnings: DesignWarning[] = []
  // points 已被圆角处理过，重建需从当前折线再次施加——半径只会变大或不变，幂等安全
  const filleted = applyMinBendRadius(stroke.points, settings.minBendRadius, stroke.closed)
  for (const w of filleted.warnings) {
    warnings.push({ level: 'warn', strokeId: stroke.id, message: `${stroke.name}：${w.message}` })
  }
  if (settings.selfIntersectCheck) {
    const hits = findSelfIntersections(filleted.points, filleted.closed)
    if (hits.length) {
      warnings.push({ level: 'error', strokeId: stroke.id, message: `${stroke.name}：检测到 ${hits.length} 处自交` })
    }
  }
  return {
    stroke: { ...stroke, points: filleted.points, length: polylineLength(filleted.points, filleted.closed) },
    warnings,
  }
}
