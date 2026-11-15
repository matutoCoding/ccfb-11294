import { useRef } from 'react';
import type { Order, SvgSource, TextSource } from '../types';
import { SYSTEM_FONTS, TUBE_DIAMETERS_MM, NEON_COLORS } from '../constants';
import { useFontStore } from '../store/fontStore';
import { useToast } from './toast';
import { readFileAsText } from '../lib/util';

interface Props {
  order: Order;
  colorId: string;
  diameterMm: number;
  onColor: (id: string) => void;
  onDiameter: (mm: number) => void;
  onChange: (patch: Partial<Order>) => void;
  onBuild: () => void;
  building: boolean;
}

export default function SourcePanel({
  order,
  colorId,
  diameterMm,
  onColor,
  onDiameter,
  onChange,
  onBuild,
  building,
}: Props) {
  const fontStore = useFontStore();
  const toast = useToast();
  const svgRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const src = order.source;

  const setText = (patch: Partial<TextSource>) => {
    if (src.type !== 'text') return;
    onChange({ source: { ...src, ...patch } });
  };

  const handleSvg = async (file: File | undefined) => {
    if (!file) return;
    try {
      const svg = await readFileAsText(file);
      if (!/<svg[\s>]/i.test(svg)) throw new Error('文件内容不是 SVG');
      const next: SvgSource = { type: 'svg', svg, fileName: file.name };
      onChange({ source: next });
      toast(`已载入 ${file.name}`, 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'SVG 读取失败', 'err');
    } finally {
      if (svgRef.current) svgRef.current.value = '';
    }
  };

  const handleFont = async (file: File | undefined) => {
    if (!file) return;
    try {
      const family = await fontStore.upload(file);
      if (src.type === 'text') setText({ fontFamily: family });
      toast(`字体 ${file.name} 已安装`, 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : '字体安装失败', 'err');
    } finally {
      if (fontRef.current) fontRef.current.value = '';
    }
  };

  return (
    <>
      <div className="panel">
        <h3>设计内容</h3>
        <div className="row" style={{ marginBottom: 12 }}>
          <button
            className={src.type === 'text' ? 'primary small' : 'small'}
            onClick={() =>
              onChange({
                source: {
                  type: 'text',
                  text: '霓虹',
                  fontFamily: 'Microsoft YaHei',
                  bold: true,
                  fontSizeMm: Math.round(order.board.heightMm * 0.45),
                  letterSpacingMm: 30,
                },
              })
            }
          >
            文字
          </button>
          <button
            className={src.type === 'svg' ? 'primary small' : 'small'}
            onClick={() => svgRef.current?.click()}
          >
            导入 SVG
          </button>
          <input
            ref={svgRef}
            type="file"
            accept=".svg,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => void handleSvg(e.target.files?.[0])}
          />
        </div>

        {src.type === 'text' ? (
          <>
            <div className="field">
              <label>文字内容</label>
              <input
                value={src.text}
                maxLength={20}
                onChange={(e) => setText({ text: e.target.value })}
                placeholder="输入要做成灯牌的文字"
              />
            </div>
            <div className="field">
              <label>字体</label>
              <select value={src.fontFamily} onChange={(e) => setText({ fontFamily: e.target.value })}>
                <optgroup label="系统字体">
                  {SYSTEM_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </optgroup>
                {fontStore.customFonts.length > 0 && (
                  <optgroup label="我上传的字体">
                    {fontStore.customFonts.map((f) => (
                      <option key={f.family} value={f.family}>
                        {f.fileName}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="field">
              <button className="small" onClick={() => fontRef.current?.click()}>
                上传 TTF / OTF 字体
              </button>
              <input
                ref={fontRef}
                type="file"
                accept=".ttf,.otf"
                style={{ display: 'none' }}
                onChange={(e) => void handleFont(e.target.files?.[0])}
              />
            </div>
            <div className="field">
              <label>
                粗体：
                <input
                  type="checkbox"
                  checked={src.bold}
                  onChange={(e) => setText({ bold: e.target.checked })}
                  style={{ width: 'auto', marginLeft: 8 }}
                />
              </label>
            </div>
            <div className="field">
              <label>字号（物理高度 mm）：{src.fontSizeMm}</label>
              <input
                type="range"
                min={40}
                max={Math.round(order.board.heightMm * 0.9)}
                value={src.fontSizeMm}
                onChange={(e) => setText({ fontSizeMm: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>字间距 mm：{src.letterSpacingMm}</label>
              <input
                type="range"
                min={0}
                max={120}
                value={src.letterSpacingMm}
                onChange={(e) => setText({ letterSpacingMm: Number(e.target.value) })}
              />
            </div>
          </>
        ) : (
          <div className="field">
            <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
              当前图形：{src.fileName}
            </div>
            <label>排管方式</label>
            <div className="row" style={{ marginBottom: 8 }}>
              <button
                className={(src.traceMode ?? 'contour') === 'contour' ? 'primary small' : 'small'}
                onClick={() => onChange({ source: { ...src, traceMode: 'contour' } })}
              >
                沿轮廓
              </button>
              <button
                className={src.traceMode === 'skeleton' ? 'primary small' : 'small'}
                onClick={() => onChange({ source: { ...src, traceMode: 'skeleton' } })}
              >
                沿中轴
              </button>
            </div>
            <button className="small" onClick={() => svgRef.current?.click()}>
              重新选择 SVG
            </button>
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              实心 logo 建议沿轮廓走闭合管；线条/书法图形可用中轴模式。
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>弯管参数</h3>
        <div className="field">
          <label>最小弯管半径 mm：{order.bendMinRadiusMm}</label>
          <input
            type="range"
            min={6}
            max={60}
            value={order.bendMinRadiusMm}
            onChange={(e) => onChange({ bendMinRadiusMm: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>灯管最小间距 mm：{order.spacingMm}</label>
          <input
            type="range"
            min={6}
            max={40}
            value={order.spacingMm}
            onChange={(e) => onChange({ spacingMm: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>管径</label>
          <select value={diameterMm} onChange={(e) => onDiameter(Number(e.target.value))}>
            {TUBE_DIAMETERS_MM.map((d) => (
              <option key={d} value={d}>
                Φ{d} mm
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel">
        <h3>霓虹配色（气体 / 荧光粉）</h3>
        <div className="color-grid">
          {NEON_COLORS.map((p) => (
            <div
              key={p.id}
              className={`color-item ${colorId === p.id ? 'selected' : ''}`}
              onClick={() => onColor(p.id)}
            >
              <span
                className="color-swatch"
                style={{ background: p.core, boxShadow: `0 0 10px ${p.glow}` }}
              />
              <span className="meta">
                <span className="name">{p.name}</span>
                <span className="proc">{p.process}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <button className="primary" style={{ width: '100%', padding: '12px' }} onClick={onBuild} disabled={building}>
        {building ? '正在沿笔画排管…' : '重新生成灯管路径'}
      </button>
    </>
  );
}
