import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Trash2, Upload, Wand2 } from 'lucide-react'
import { useOrders } from '../store/orderStore'
import { useSettings } from '../store/settingsStore'
import { buildStrokes, rebuildStrokeGeometry } from '../lib/strokeBuilder'
import { textToContours, loadFontFromFile } from '../lib/textToPath'
import { parseSvg, sampleSvgItems } from '../lib/svgImport'
import { fontRegistry, BUNDLED_FONTS } from '../lib/fontRegistry'
import { nanoid } from 'nanoid'
import { SvgPreview } from '../components/SvgPreview'
import { NeonCanvas } from '../components/NeonCanvas'
import { useToast } from '../components/Toast'
import type { NeonStroke, TubeAnimMode } from '../types'
import type { RawContour } from '../lib/textToPath'

const ANIM_LABEL: Record<TubeAnimMode, string> = {
  steady: '常亮', flicker: '闪烁', chase: '流水', fault: '接触不良',
}

export function LayoutPage() {
  const order = useOrders((s) => s.orders.find((o) => o.id === s.currentId))
  const update = useOrders((s) => s.update)
  const settings = useSettings()
  const toast = useToast()
  const svgRef = useRef<HTMLInputElement>(null)
  const fontUploadRef = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('NEON')
  const [fontId, setFontId] = useState(BUNDLED_FONTS[0].id)
  const [targetWidth, setTargetWidth] = useState(900)
  const [colorId, setColorId] = useState(settings.colorPresets[0]?.id ?? 'neon-red')
  const [tubeDiameter, setTubeDiameter] = useState(8)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const colorOf = useMemo(() => {
    const map = new Map(settings.colorPresets.map((p) => [p.id, p.glow]))
    return (id: string) => map.get(id) ?? '#ff2d3d'
  }, [settings.colorPresets])

  if (!order) return <div className="empty">请先在订单列表中选择或新建订单</div>

  const selected = order.strokes.find((s) => s.id === selectedId) ?? null

  const commitStrokes = (strokes: NeonStroke[], warnings: typeof order.warnings) => {
    update(order.id, { strokes: [...order.strokes, ...strokes], warnings })
    if (strokes.length) {
      setSelectedId(strokes[0].id)
      toast.show(`已生成 ${strokes.length} 根灯管`, 'ok')
    }
  }

  const generateFromText = async () => {
    if (!text.trim()) return toast.show('请输入文字', 'err')
    setBusy(true)
    try {
      const font = await fontRegistry.get(fontId, useSettings.getState())
      const raw: RawContour[] = textToContours(font, text.trim(), Math.min(targetWidth, order.board.width * 0.92))
      const built = buildStrokes({ contours: raw, colorId, tubeDiameter, settings: useSettings.getState(), namePrefix: text.trim().slice(0, 6) })
      commitStrokes(built.strokes, built.warnings)
    } catch (e) {
      toast.show((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const onSvgFile = async (file: File) => {
    setBusy(true)
    try {
      const svgText = await file.text()
      const parsed = parseSvg(svgText)
      const targetMM = Math.min(targetWidth, order.board.width * 0.92)
      const contours = sampleSvgItems(parsed, targetMM, useSettings.getState().sampleSpacing)
      const built = buildStrokes({ contours, colorId, tubeDiameter, settings: useSettings.getState(), namePrefix: file.name.replace('.svg', '').slice(0, 8) })
      commitStrokes(built.strokes, built.warnings)
    } catch (e) {
      toast.show(`SVG 导入失败：${(e as Error).message}`, 'err')
    } finally {
      setBusy(false)
    }
  }

  const applyRadiusToAll = () => {
    const warnings: typeof order.warnings = []
    const strokes = order.strokes.map((s) => {
      const r = rebuildStrokeGeometry(s, useSettings.getState())
      warnings.push(...r.warnings)
      return r.stroke
    })
    update(order.id, { strokes, warnings })
    toast.show('已按当前最小弯管半径重新处理全部灯管', 'ok')
  }

  const patchSelected = (patch: Partial<NeonStroke>) => {
    if (!selected) return
    update(order.id, {
      strokes: order.strokes.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)),
    })
  }

  const removeSelected = () => {
    if (!selected) return
    update(order.id, { strokes: order.strokes.filter((s) => s.id !== selected.id) })
    setSelectedId(null)
  }

  const clearAll = () => {
    if (!confirm('清空当前订单的全部灯管？')) return
    update(order.id, { strokes: [], warnings: [] })
    setSelectedId(null)
  }

  const onFontUpload = async (file: File) => {
    try {
      const { name, dataUrl } = await loadFontFromFile(file)
      const id = nanoid(8)
      useSettings.getState().addCustomFont({ id, name, dataUrl })
      setFontId(id)
      toast.show(`字体「${name}」已上传，可用于中文排管`, 'ok')
    } catch (e) {
      toast.show(`字体加载失败：${(e as Error).message}`, 'err')
    }
  }

  const totalLen = order.strokes.reduce((a, s) => a + s.length, 0) / 1000

  return (
    <div className="view-split">
      <div className="side-col">
        <div className="panel">
          <h3>① 输入内容生成管道路径</h3>
          <div className="field">
            <label>文字（中文需在设置页上传 TTF 字体）</label>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="输入文字，如 NEON 或 酒吧" />
          </div>
          <div className="field">
            <label>字体</label>
            <select value={fontId} onChange={(e) => setFontId(e.target.value)}>
              {BUNDLED_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              {settings.customFonts.map((f) => <option key={f.id} value={f.id}>{f.name}（自定义）</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="small" onClick={() => fontUploadRef.current?.click()}>上传 TTF 字体</button>
            <input ref={fontUploadRef} type="file" accept=".ttf,.otf" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFontUpload(f); e.target.value = '' }} />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>排版目标宽度：{targetWidth} mm（自动等比缩放，不超过背板宽度 92%）</label>
            <input type="range" min={200} max={Math.max(400, order.board.width)} value={targetWidth}
              onChange={(e) => setTargetWidth(Number(e.target.value))} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="primary" disabled={busy} onClick={generateFromText}>
              <Wand2 size={13} style={{ verticalAlign: -2 }} /> {busy ? '生成中…' : '生成灯管'}
            </button>
            <button onClick={() => svgRef.current?.click()} disabled={busy}>
              <Upload size={13} style={{ verticalAlign: -2 }} /> 导入 SVG
            </button>
            <input ref={svgRef} type="file" accept=".svg,image/svg+xml" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onSvgFile(f); e.target.value = '' }} />
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
            轮廓自动等弧长采样（间距 {settings.sampleSpacing}mm），转角按最小弯管半径 {settings.minBendRadius}mm 做相切圆弧处理。
          </p>
        </div>

        <div className="panel">
          <h3>② 灯管参数（对新生成的灯管生效）</h3>
          <div className="grid cols-2">
            <div className="field">
              <label>管径 mm</label>
              <select value={tubeDiameter} onChange={(e) => setTubeDiameter(Number(e.target.value))}>
                {[6, 8, 10, 12].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>气体/荧光粉颜色</label>
              <select value={colorId} onChange={(e) => setColorId(e.target.value)}>
                {settings.colorPresets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="color-grid">
            {settings.colorPresets.map((c) => (
              <div key={c.id} className="color-cell" onClick={() => setColorId(c.id)}>
                <div className={`color-swatch ${colorId === c.id ? 'selected' : ''}`}
                  style={{ background: c.glow, boxShadow: `0 0 10px ${c.glow}` }} />
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>③ 灯管列表（{order.strokes.length} 根 / 共 {totalLen.toFixed(2)} m）</h3>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="small" onClick={applyRadiusToAll}><RefreshCw size={12} /> 按当前半径重排</button>
            <button className="small danger" onClick={clearAll}><Trash2 size={12} /> 清空</button>
          </div>
          {order.strokes.length === 0 && <div className="muted" style={{ fontSize: 12 }}>暂无灯管</div>}
          {order.strokes.map((s) => (
            <div key={s.id} className={`stroke-item ${s.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(s.id)}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 7 }}>
                  <span className="color-swatch" style={{ width: 14, height: 14, background: colorOf(s.colorId), boxShadow: `0 0 6px ${colorOf(s.colorId)}` }} />
                  <strong style={{ fontSize: 12 }}>{s.name}</strong>
                </div>
                <span className="muted mono" style={{ fontSize: 11 }}>{(s.length / 1000).toFixed(2)}m · {s.tubeDiameter}mm</span>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="panel">
            <h3>④ 选中灯管：{selected.name}</h3>
            <div className="field">
              <label>颜色</label>
              <select value={selected.colorId} onChange={(e) => patchSelected({ colorId: e.target.value })}>
                {settings.colorPresets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>动画模式</label>
              <div className="seg">
                {(Object.keys(ANIM_LABEL) as TubeAnimMode[]).map((m) => (
                  <button key={m} className={selected.animation === m ? 'active' : ''}
                    onClick={() => patchSelected({ animation: m })}>{ANIM_LABEL[m]}</button>
                ))}
              </div>
            </div>
            {selected.animation === 'fault' && (
              <div className="field">
                <label>接触不良管段：{Math.round(selected.faultRange.from * 100)}% ~ {Math.round(selected.faultRange.to * 100)}%（沿灯管弧长）</label>
                <div className="row">
                  <input type="range" min={0} max={0.95} step={0.01} value={selected.faultRange.from}
                    onChange={(e) => patchSelected({ faultRange: { ...selected.faultRange, from: Math.min(Number(e.target.value), selected.faultRange.to - 0.05) } })} />
                  <input type="range" min={0.05} max={1} step={0.01} value={selected.faultRange.to}
                    onChange={(e) => patchSelected({ faultRange: { ...selected.faultRange, to: Math.max(Number(e.target.value), selected.faultRange.from + 0.05) } })} />
                </div>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label className="row" style={{ margin: 0, gap: 6 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={selected.visible}
                  onChange={(e) => patchSelected({ visible: e.target.checked })} /> 显示该灯管
              </label>
              <button className="small danger" onClick={removeSelected}><Trash2 size={12} /> 删除</button>
            </div>
          </div>
        )}

        {order.warnings.length > 0 && (
          <div className="panel">
            <h3><AlertTriangle size={14} style={{ verticalAlign: -2, color: 'var(--warn)' }} /> 工艺校验（{order.warnings.length}）</h3>
            <div className="warning-list">
              {order.warnings.map((w, i) => (
                <div key={i} className={`warning-item ${w.level}`}>
                  <span>{w.level === 'error' ? '⛔' : '⚠️'}</span><span>{w.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="stage" style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'transparent', border: 'none' }}>
        <div className="panel" style={{ flex: '0 0 auto' }}>
          <SvgPreview board={order.board} strokes={order.strokes} colorOf={colorOf} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="stage" style={{ flex: 1, position: 'relative' }}>
          <NeonCanvas order={order} selectedStrokeId={selectedId} />
        </div>
      </div>
    </div>
  )
}
