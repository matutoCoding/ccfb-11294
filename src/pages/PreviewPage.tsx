import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnimationConfig, FlickerMode } from '../types';
import { useOrderStore, useSettingsStore } from '../store/useStores';
import { useToast } from '../components/toast';
import Viewer3D, { type Viewer3DHandle } from '../components/Viewer3D';
import QuoteModal from '../components/QuoteModal';
import { exportAnnotatedShot } from '../components/screenshot';
import { calcQuote } from '../core/quote';

const MODES: Array<{ id: FlickerMode; name: string; desc: string }> = [
  { id: 'steady', name: '常亮', desc: '稳定发光' },
  { id: 'flicker', name: '闪烁', desc: '随机频率明灭' },
  { id: 'chase', name: '流水', desc: '亮斑沿管流动' },
  { id: 'broken', name: '接触不良', desc: '需先在排线页指定故障段' },
];

export default function PreviewPage() {
  const orders = useOrderStore((s) => s.orders);
  const currentId = useOrderStore((s) => s.currentId);
  const upsert = useOrderStore((s) => s.upsert);
  const create = useOrderStore((s) => s.create);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const toast = useToast();
  const viewerRef = useRef<Viewer3DHandle>(null);
  const [showQuote, setShowQuote] = useState(false);
  const [bloom, setBloom] = useState(settings.bloomStrength);
  const order = orders.find((o) => o.id === currentId);

  useEffect(() => {
    if (!order) create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quote = useMemo(() => (order ? calcQuote(order, settings) : null), [order, settings]);
  const brokenCount = order?.runs.filter((r) => r.broken).length ?? 0;

  if (!order) return <div className="empty">正在初始化…</div>;

  const anim = order.animation;
  const patchAnim = (patch: Partial<AnimationConfig>) => upsert({ ...order, animation: { ...anim, ...patch } });

  const handleScreenshot = () => {
    const engine = viewerRef.current?.engine();
    if (!engine) return;
    const dataUrl = engine.capture();
    exportAnnotatedShot(dataUrl, order.runs, order.board, order.bendMinRadiusMm, order.name);
    toast('已导出带尺寸与颜色参数的 PNG 截图', 'ok');
  };

  return (
    <div className="layout-workbench">
      <div className="side-col">
        <div className="panel">
          <h3>发光动画</h3>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {MODES.map((m) => (
              <button
                key={m.id}
                className={anim.mode === m.id ? 'primary small' : 'small'}
                onClick={() => patchAnim({ mode: m.id })}
                title={m.desc}
              >
                {m.name}
              </button>
            ))}
          </div>
          {anim.mode === 'broken' && brokenCount === 0 && (
            <div className="badge warn" style={{ marginTop: 10, fontSize: 11 }}>
              尚未指定故障段，请在排线页勾选「模拟接触不良」
            </div>
          )}
        </div>

        <div className="panel">
          <h3>动画参数</h3>
          <div className="field">
            <label>速度倍率：{anim.speed.toFixed(1)}x</label>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={anim.speed}
              onChange={(e) => patchAnim({ speed: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>亮度强度：{anim.intensity.toFixed(1)}</label>
            <input
              type="range"
              min={0.3}
              max={1.2}
              step={0.05}
              value={anim.intensity}
              onChange={(e) => patchAnim({ intensity: Number(e.target.value) })}
            />
          </div>
          {anim.mode === 'flicker' && (
            <div className="field">
              <label>闪烁基准频率：{anim.flickerHz} Hz</label>
              <input
                type="range"
                min={2}
                max={20}
                value={anim.flickerHz}
                onChange={(e) => patchAnim({ flickerHz: Number(e.target.value) })}
              />
            </div>
          )}
          {anim.mode === 'chase' && (
            <div className="field">
              <label>流水周期：{anim.chaseCycleSec.toFixed(1)} 秒</label>
              <input
                type="range"
                min={0.6}
                max={6}
                step={0.1}
                value={anim.chaseCycleSec}
                onChange={(e) => patchAnim({ chaseCycleSec: Number(e.target.value) })}
              />
            </div>
          )}
        </div>

        <div className="panel">
          <h3>辉光与画质</h3>
          <div className="field">
            <label>辉光扩散强度：{bloom.toFixed(2)}</label>
            <input
              type="range"
              min={0}
              max={2.5}
              step={0.05}
              value={bloom}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBloom(v);
                updateSettings({ bloomStrength: v });
              }}
            />
          </div>
          <div className="field">
            <label>渲染质量</label>
            <select
              value={settings.quality}
              onChange={(e) => updateSettings({ quality: e.target.value as 'auto' | 'low' | 'high' })}
            >
              <option value="auto">自动（低于 50fps 自动降质）</option>
              <option value="high">高（高 DPR + 抗锯齿）</option>
              <option value="low">流畅（限制 DPR）</option>
            </select>
          </div>
        </div>
      </div>

      <div className="center-col">
        <div style={{ flex: 1, minHeight: 0 }}>
          <Viewer3D
            ref={viewerRef}
            runs={order.runs}
            board={order.board}
            animation={anim}
            mode="night"
            bloomStrength={bloom}
            quality={settings.quality}
            showFps
          />
        </div>
        <div className="panel" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="primary" onClick={handleScreenshot} disabled={order.runs.length === 0}>
            📷 导出带参数截图 PNG
          </button>
          <button onClick={() => setShowQuote(true)} disabled={order.runs.length === 0}>
            查看报价单
          </button>
          <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
            鼠标左键旋转 · 右键平移 · 滚轮缩放
          </span>
        </div>
      </div>

      <div className="side-col">
        <div className="panel">
          <h3>电气估算</h3>
          {quote && (
            <>
              <div className="stat-cards" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 10 }}>
                <div className="stat-card" style={{ padding: 10 }}>
                  <div className="value">{(quote.totalLengthMm / 1000).toFixed(2)}m</div>
                  <div className="label">灯管总长</div>
                </div>
                <div className="stat-card" style={{ padding: 10 }}>
                  <div className="value">{quote.totalWatt.toFixed(0)}W</div>
                  <div className="label">估算功率</div>
                </div>
                <div className="stat-card" style={{ padding: 10 }}>
                  <div className="value">{quote.transformerCount}</div>
                  <div className="label">变压器台数</div>
                </div>
                <div className="stat-card" style={{ padding: 10 }}>
                  <div className="value">
                    {settings.currency}
                    {quote.total.toFixed(0)}
                  </div>
                  <div className="label">含税总价</div>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                按 {settings.transformerWattPerMeter} W/m 估算，单台变压器上限 {settings.transformerMaxWatt}W。
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h3>稳定性说明</h3>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div>· 动画时间由渲染时钟累计驱动，旋转视角不会重启动画、不产生闪烁跳变</div>
            <div>· 辉光使用 UnrealBloom 离屏后处理，分辨率随容器稳定变化</div>
            <div>· 自动模式下连续低于 50fps 会自动降低像素比保证 60fps 目标</div>
          </div>
        </div>
      </div>

      {showQuote && <QuoteModal order={order} onClose={() => setShowQuote(false)} />}
    </div>
  );
}
