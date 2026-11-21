import { useRef, useState } from 'react'
import { Camera, FileDown, Printer } from 'lucide-react'
import { NeonCanvas } from '../components/NeonCanvas'
import { useOrders } from '../store/orderStore'
import { useSettings } from '../store/settingsStore'
import { buildQuoteText, calcQuote, downloadBlob, fmtMoney, materialName } from '../lib/quote'
import { useToast } from '../components/Toast'
import type { AnimationSpec, QuoteSpec } from '../types'
import type { NeonEngine } from '../three/NeonEngine'

export function NightPage() {
  const order = useOrders((s) => s.orders.find((o) => o.id === s.currentId))
  const update = useOrders((s) => s.update)
  const settings = useSettings()
  const toast = useToast()
  const engineRef = useRef<NeonEngine | null>(null)
  const [fps, setFps] = useState(60)

  if (!order) return <div className="empty">请先在订单列表中选择或新建订单</div>

  const qb = calcQuote(order)
  const anim = order.animation
  const patchAnim = (p: Partial<AnimationSpec>) => update(order.id, { animation: { ...anim, ...p } })
  const patchQuote = (p: Partial<QuoteSpec>) => update(order.id, { quote: { ...order.quote, ...p } })

  const takeScreenshot = (withOverlay: boolean) => {
    const engine = engineRef.current
    if (!engine) return
    const raw = engine.screenshot()
    if (!withOverlay) {
      downloadBlob(dataUrlToBlob(raw), `${order.code}-夜景.png`, 'image/png')
      return
    }
    // 叠加尺寸与颜色参数后导出
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height + 150
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#0b0e13'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0)
      ctx.fillStyle = '#e6ebf2'
      ctx.font = '22px sans-serif'
      const usedColors = [...new Set(order.strokes.map((s) => s.colorId))]
        .map((id) => settings.colorPresets.find((c) => c.id === id)?.name ?? id)
        .join('、')
      const lines = [
        `订单 ${order.code}｜背板 ${order.board.width}×${order.board.height}×${order.board.thickness}mm（${materialName(order.board.material)}）｜管托高 ${order.board.tubeZ}mm`,
        `灯管 ${qb.strokeCount} 根｜总长 ${qb.totalLengthM.toFixed(2)}m｜管径 ${order.strokes[0]?.tubeDiameter ?? 8}mm｜颜色：${usedColors || '—'}`,
        `变压器 ${qb.transformerW}W｜报价 ${fmtMoney(qb.total)}`,
      ]
      lines.forEach((line, i) => ctx.fillText(line, 24, img.height + 38 + i * 36))
      c.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${order.code}-夜景-带参数.png`, 'image/png')
      }, 'image/png')
    }
    img.src = raw
    toast.show('截图已生成', 'ok')
  }

  const exportQuote = () => {
    downloadBlob(buildQuoteText(order, qb), `${order.code}-报价单.txt`, 'text/plain;charset=utf-8')
  }

  return (
    <div className="view-split wide-left">
      <div className="side-col">
        <div className="panel">
          <h3>动画总控</h3>
          <div className="field">
            <label>全局速度：{anim.speed.toFixed(2)}×</label>
            <input type="range" min={0.2} max={3} step={0.05} value={anim.speed}
              onChange={(e) => patchAnim({ speed: Number(e.target.value) })} />
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label>闪烁频率</label>
              <input type="number" min={0.2} max={5} step={0.1} value={anim.flickerRate}
                onChange={(e) => patchAnim({ flickerRate: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>流水周期 (s)</label>
              <input type="number" min={0.5} max={12} step={0.5} value={anim.chasePeriod}
                onChange={(e) => patchAnim({ chasePeriod: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>接触不良频率</label>
              <input type="number" min={0.2} max={5} step={0.1} value={anim.faultRate}
                onChange={(e) => patchAnim({ faultRate: Number(e.target.value) })} />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
            单根灯管的动画模式在「灯管排线」页设置；辉光强度在「设置」页调整。
            拖动场景可旋转视角，滚轮缩放，右键平移。
          </p>
        </div>

        <div className="panel">
          <h3>工程核算与报价</h3>
          <div className="kv"><span className="k">灯管数量</span><span>{qb.strokeCount} 根</span></div>
          <div className="kv"><span className="k">灯管总长</span><span className="mono">{qb.totalLengthM.toFixed(2)} m（{qb.totalLengthMM.toFixed(0)} mm）</span></div>
          <div className="kv"><span className="k">估算负载（60W/m）</span><span className="mono">{qb.tubeLoadW.toFixed(0)} W</span></div>
          <div className="kv"><span className="k">变压器配置</span><span className="mono">{qb.transformerW} W（冗余 {(order.quote.transformerMargin * 100).toFixed(0)}%）</span></div>
          <div className="kv"><span className="k">背板面积</span><span className="mono">{qb.boardAreaSqm.toFixed(2)} m²</span></div>

          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>灯管单价 元/m</label>
              <input type="number" value={order.quote.pricePerMeter}
                onChange={(e) => patchQuote({ pricePerMeter: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>变压器 元/W</label>
              <input type="number" step={0.1} value={order.quote.pricePerWatt}
                onChange={(e) => patchQuote({ pricePerWatt: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>背板 元/m²</label>
              <input type="number" value={order.quote.boardPricePerSqm}
                onChange={(e) => patchQuote({ boardPricePerSqm: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>固定费用 元</label>
              <input type="number" value={order.quote.fixedFee}
                onChange={(e) => patchQuote({ fixedFee: Number(e.target.value) })} />
            </div>
          </div>

          <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 12, marginTop: 4 }}>
            <div className="kv"><span className="k">灯管费用</span><span>{fmtMoney(qb.tubeCost)}</span></div>
            <div className="kv"><span className="k">变压器</span><span>{fmtMoney(qb.transformerCost)}</span></div>
            <div className="kv"><span className="k">背板</span><span>{fmtMoney(qb.boardCost)}</span></div>
            <div className="kv"><span className="k">固定费用</span><span>{fmtMoney(qb.fixedCost)}</span></div>
            <div className="kv" style={{ marginTop: 8 }}><span className="k">合计</span><span className="quote-total">{fmtMoney(qb.total)}</span></div>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="primary" style={{ flex: 1 }} onClick={exportQuote}><FileDown size={13} style={{ verticalAlign: -2 }} /> 导出报价单</button>
            <button onClick={() => window.print()}><Printer size={13} style={{ verticalAlign: -2 }} /> 打印</button>
          </div>
        </div>

        <div className="panel">
          <h3>截图</h3>
          <div className="row" style={{ gap: 8 }}>
            <button style={{ flex: 1 }} onClick={() => takeScreenshot(true)}><Camera size={13} style={{ verticalAlign: -2 }} /> 带尺寸/颜色参数</button>
            <button style={{ flex: 1 }} onClick={() => takeScreenshot(false)}>纯效果图</button>
          </div>
        </div>
      </div>

      <div className="stage" style={{ position: 'relative' }}>
        <NeonCanvas order={order} onEngine={(e) => { engineRef.current = e }} onFps={setFps} />
        <div className={`fps-badge ${fps >= 55 ? 'good' : 'bad'}`}>{fps} FPS</div>
      </div>
    </div>
  )
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] ?? 'image/png'
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
