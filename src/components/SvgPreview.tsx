import { useMemo } from 'react'
import type { BoardSpec, NeonStroke } from '../types'

interface Props {
  board: BoardSpec
  strokes: NeonStroke[]
  colorOf: (id: string) => string
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/** 2D 俯视预览：背板轮廓 + 灯管中心线，用于排线核对与笔画选择 */
export function SvgPreview({ board, strokes, colorOf, selectedId, onSelect }: Props) {
  const pad = 30
  const vb = useMemo(() => {
    const w = board.width + pad * 2
    const h = board.height + pad * 2
    return { w, h, vb: `${-w / 2} ${-h / 2} ${w} ${h}` }
  }, [board.width, board.height])

  return (
    <svg
      className="svg-preview"
      viewBox={vb.vb}
      style={{ aspectRatio: `${vb.w} / ${vb.h}` }}
      onClick={() => onSelect(null)}
    >
      <rect
        x={-board.width / 2} y={-board.height / 2}
        width={board.width} height={board.height}
        rx={board.cornerRadius}
        fill="#141821" stroke="#3a4456" strokeWidth={2}
      />
      {/* 尺寸标注 */}
      <g stroke="#5a6a82" strokeWidth={1} fill="#7d8ca3" fontSize={16} fontFamily="Consolas">
        <line x1={-board.width / 2} y1={board.height / 2 + 18} x2={board.width / 2} y2={board.height / 2 + 18} />
        <line x1={-board.width / 2} y1={board.height / 2 + 12} x2={-board.width / 2} y2={board.height / 2 + 24} />
        <line x1={board.width / 2} y1={board.height / 2 + 12} x2={board.width / 2} y2={board.height / 2 + 24} />
        <text x={0} y={board.height / 2 + 38} textAnchor="middle">{board.width} mm</text>
        <line x1={-board.width / 2 - 18} y1={-board.height / 2} x2={-board.width / 2 - 18} y2={board.height / 2} />
        <text x={-board.width / 2 - 26} y={0} textAnchor="middle" transform={`rotate(-90 ${-board.width / 2 - 26} 0)`}>{board.height} mm</text>
      </g>
      {strokes.filter((s) => s.visible).map((s) => {
        if (s.points.length < 2) return null
        const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + (s.closed ? 'Z' : '')
        const selected = s.id === selectedId
        return (
          <path
            key={s.id}
            d={d}
            stroke={colorOf(s.colorId)}
            strokeWidth={selected ? 4 : 2.2}
            opacity={selected ? 1 : 0.85}
            style={{ filter: `drop-shadow(0 0 ${selected ? 8 : 4}px ${colorOf(s.colorId)})`, cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onSelect(s.id) }}
          />
        )
      })}
    </svg>
  )
}
