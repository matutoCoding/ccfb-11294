import { NeonCanvas } from '../components/NeonCanvas'
import { useOrders } from '../store/orderStore'
import { materialName } from '../lib/quote'
import type { BoardMaterial, BoardSpec } from '../types'

const MATERIALS: { key: BoardMaterial; label: string; desc: string }[] = [
  { key: 'acrylic', label: '亚克力', desc: '高光泽、透光柔和，适合室内招牌' },
  { key: 'metal', label: '金属', desc: '拉丝金属板，反光强、工业感' },
  { key: 'wood', label: '木纹', desc: '温润质感，咖啡馆酒吧常用' },
]

export function BoardPage() {
  const order = useOrders((s) => s.orders.find((o) => o.id === s.currentId))
  const update = useOrders((s) => s.update)
  if (!order) return <div className="empty">请先在订单列表中选择或新建订单</div>

  const board = order.board
  const patch = (p: Partial<BoardSpec>) => update(order.id, { board: { ...board, ...p } })

  return (
    <div className="view-split wide-left">
      <div className="side-col">
        <div className="panel">
          <h3>背板材质</h3>
          <div className="seg" style={{ flexDirection: 'column' }}>
            {MATERIALS.map((m) => (
              <button key={m.key} className={board.material === m.key ? 'active' : ''}
                onClick={() => patch({ material: m.key })}
                style={{ textAlign: 'left', padding: '10px 12px' }}>
                <strong>{m.label}</strong>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{m.desc}</div>
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>表面处理（{materialName(board.material)}粗糙度/光泽）：{board.finish.toFixed(2)}</label>
            <input type="range" min={0} max={1} step={0.01} value={board.finish}
              onChange={(e) => patch({ finish: Number(e.target.value) })} />
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label>背板底色</label>
              <input type="color" value={board.color} onChange={(e) => patch({ color: e.target.value })} />
            </div>
            <div className="field">
              <label>面板圆角 mm</label>
              <input type="number" min={0} max={60} value={board.cornerRadius}
                onChange={(e) => patch({ cornerRadius: Number(e.target.value) })} />
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>尺寸（mm）</h3>
          <div className="grid cols-2">
            <div className="field">
              <label>宽度</label>
              <input type="number" min={200} max={6000} step={10} value={board.width}
                onChange={(e) => patch({ width: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>高度</label>
              <input type="number" min={150} max={3000} step={10} value={board.height}
                onChange={(e) => patch({ height: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>板厚</label>
              <input type="number" min={5} max={80} step={1} value={board.thickness}
                onChange={(e) => patch({ thickness: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>管托高度（灯管离板面）</label>
              <input type="number" min={10} max={120} step={2} value={board.tubeZ}
                onChange={(e) => patch({ tubeZ: Number(e.target.value) })} />
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {[[1200, 400], [900, 300], [1800, 500], [600, 600]].map(([w, h]) => (
              <button key={`${w}x${h}`} className="small" onClick={() => patch({ width: w, height: h })}>{w}×{h}</button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            修改尺寸后已排灯管保持原坐标；如超出板面请回到「灯管排线」调整目标宽度后重新生成。
          </p>
        </div>
      </div>

      <div className="stage" style={{ position: 'relative' }}>
        <NeonCanvas order={order} />
      </div>
    </div>
  )
}
