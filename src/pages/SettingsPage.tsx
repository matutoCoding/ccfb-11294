import { useRef, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { useSettings } from '../store/settingsStore'
import { useOrders } from '../store/orderStore'
import { useToast } from '../components/Toast'
import { loadFontFromFile } from '../lib/textToPath'
import type { AppSettings, NeonColorPreset } from '../types'

export function SettingsPage() {
  const settings = useSettings()
  const orderCount = useOrders((s) => s.orders.length)
  const toast = useToast()
  const fontRef = useRef<HTMLInputElement>(null)
  const [custom, setCustom] = useState({ name: '', glow: '#ff00ff', glass: '#ff9ee8' })

  const set = (patch: Partial<AppSettings>) => settings.set(patch)

  const addPreset = () => {
    if (!custom.name.trim()) return toast.show('请填写颜色名称', 'err')
    const preset: NeonColorPreset = {
      id: `custom-${Date.now()}`,
      name: custom.name,
      glow: custom.glow,
      glass: custom.glass,
      source: 'phosphor',
    }
    settings.addColor(preset)
    setCustom({ name: '', glow: '#ff00ff', glass: '#ff9ee8' })
    toast.show('已添加自定义颜色', 'ok')
  }

  return (
    <div className="grid cols-2" style={{ maxWidth: 1100, alignItems: 'start' }}>
      <div className="panel">
        <h3>弯管工艺约束</h3>
        <div className="field">
          <label>最小弯管半径：{settings.minBendRadius} mm（转角圆弧半径不得小于此值）</label>
          <input type="range" min={4} max={60} step={1} value={settings.minBendRadius}
            onChange={(e) => set({ minBendRadius: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>路径采样间距：{settings.sampleSpacing} mm（越小越平滑，顶点越多）</label>
          <input type="range" min={1} max={12} step={0.5} value={settings.sampleSpacing}
            onChange={(e) => set({ sampleSpacing: Number(e.target.value) })} />
        </div>
        <label className="row" style={{ gap: 8, margin: '8px 0' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={settings.selfIntersectCheck}
            onChange={(e) => set({ selfIntersectCheck: e.target.checked })} />
          生成时检测路径自交（实际弯管无法成型的硬错误）
        </label>
        <p className="muted" style={{ fontSize: 11, lineHeight: 1.7 }}>
          修改最小半径后，到「灯管排线」页点击「按当前半径重排」即可对已有灯管重新施加约束。
          当转角相邻边过短、物理上无法满足设定半径时，系统会以可达到的最大半径处理并在工艺校验中逐条告警。
        </p>
      </div>

      <div className="panel">
        <h3>夜景渲染（辉光质量与性能）</h3>
        <div className="field">
          <label>辉光强度 Bloom Strength：{settings.bloomStrength.toFixed(2)}</label>
          <input type="range" min={0.2} max={2.5} step={0.05} value={settings.bloomStrength}
            onChange={(e) => set({ bloomStrength: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>辉光扩散半径：{settings.bloomRadius.toFixed(2)}</label>
          <input type="range" min={0.1} max={1.5} step={0.05} value={settings.bloomRadius}
            onChange={(e) => set({ bloomRadius: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>辉光缓冲区分辨率</label>
          <select value={settings.bloomResolution}
            onChange={(e) => set({ bloomResolution: Number(e.target.value) })}>
            <option value={0.5}>0.5×（性能优先，低端显卡）</option>
            <option value={0.75}>0.75×（平衡，推荐）</option>
            <option value={1}>1×（全分辨率，最锐利）</option>
          </select>
        </div>
        <div className="field">
          <label>墙面光晕密度：{settings.haloDensity.toFixed(1)}×（精灵数量，越高溢散光越细腻）</label>
          <input type="range" min={0.3} max={2} step={0.1} value={settings.haloDensity}
            onChange={(e) => set({ haloDensity: Number(e.target.value) })} />
        </div>
        <p className="muted" style={{ fontSize: 11, lineHeight: 1.7 }}>
          渲染目标像素比上限 1.5、辉光走半分辨率缓冲，旋转时辉光稳定不闪烁；
          夜景页右上角实时显示 FPS，低于 55 时优先降低辉光分辨率与光晕密度。当前浏览器共 {orderCount} 个订单。
        </p>
      </div>

      <div className="panel">
        <h3>气体 / 荧光粉颜色库</h3>
        <div className="color-grid" style={{ marginBottom: 14 }}>
          {settings.colorPresets.map((c) => (
            <div key={c.id} className="color-cell">
              <div className="color-swatch" style={{ background: c.glow, boxShadow: `0 0 10px ${c.glow}` }} />
              <span>{c.name}{c.source === 'gas' ? '·气体' : '·粉管'}</span>
              {c.id.startsWith('custom-') && (
                <button className="small ghost" style={{ padding: 0, border: 'none', color: 'var(--err)' }}
                  onClick={() => settings.removeColor(c.id)}><Trash2 size={11} /></button>
              )}
            </div>
          ))}
        </div>
        <div className="grid cols-4" style={{ alignItems: 'end' }}>
          <div className="field" style={{ margin: 0, gridColumn: 'span 2' }}>
            <label>自定义名称</label>
            <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="如 桃红定制" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>发光色</label>
            <input type="color" value={custom.glow} onChange={(e) => setCustom({ ...custom, glow: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>管体色</label>
            <input type="color" value={custom.glass} onChange={(e) => setCustom({ ...custom, glass: e.target.value })} />
          </div>
        </div>
        <button className="small" style={{ marginTop: 10 }} onClick={addPreset}><Plus size={12} /> 添加自定义颜色</button>
      </div>

      <div className="panel">
        <h3>字体管理</h3>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          内置 Monoton、Bebas Neue 两款拉丁展示字体（首次使用时从 CDN 加载）。
          中文字体体积较大（数 MB ~ 数十 MB），请上传本地 TTF/OTF；上传后以 base64 持久化在浏览器中，可离线使用。
        </p>
        <button onClick={() => fontRef.current?.click()}><Upload size={13} style={{ verticalAlign: -2 }} /> 上传 TTF / OTF</button>
        <input ref={fontRef} type="file" accept=".ttf,.otf" style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const { name, dataUrl } = await loadFontFromFile(file)
              settings.addCustomFont({ id: `font-${Date.now()}`, name, dataUrl })
              toast.show(`字体「${name}」上传成功`, 'ok')
            } catch (err) {
              toast.show(`字体解析失败：${(err as Error).message}`, 'err')
            }
          }} />
        {settings.customFonts.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>字体名称</th><th style={{ width: 80 }}>操作</th></tr></thead>
            <tbody>
              {settings.customFonts.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td><button className="small danger" onClick={() => settings.removeCustomFont(f.id)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
