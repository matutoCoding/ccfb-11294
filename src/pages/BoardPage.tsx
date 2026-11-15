import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BoardConfig, BoardMaterialKind } from '../types';
import { useOrderStore, useSettingsStore } from '../store/useStores';
import { useToast } from '../components/toast';
import Viewer3D from '../components/Viewer3D';
import { BOARD_MATERIALS } from '../constants';

const WALL_COLORS = ['#17191d', '#222630', '#2b2320', '#1c2433', '#3a332c'];

export default function BoardPage() {
  const orders = useOrderStore((s) => s.orders);
  const currentId = useOrderStore((s) => s.currentId);
  const upsert = useOrderStore((s) => s.upsert);
  const create = useOrderStore((s) => s.create);
  const settings = useSettingsStore((s) => s.settings);
  const toast = useToast();
  const navigate = useNavigate();
  const order = orders.find((o) => o.id === currentId);

  useEffect(() => {
    if (!order) create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!order) return <div className="empty">正在初始化…</div>;

  const board = order.board;
  const patch = (b: Partial<BoardConfig>) => upsert({ ...order, board: { ...board, ...b } });

  return (
    <div className="layout-workbench">
      <div className="side-col">
        <div className="panel">
          <h3>背板材质</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            {BOARD_MATERIALS.map((m) => (
              <button
                key={m.id}
                className={board.material === m.id ? 'primary small' : 'small'}
                onClick={() => patch({ material: m.id as BoardMaterialKind })}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {board.material === 'acrylic' && '亚克力：高光反射，霓虹色彩还原好，室内招牌最常用。'}
            {board.material === 'metal' && '金属板：拉丝质感与环境反射强，适合工业风门店。'}
            {board.material === 'wood' && '木纹板：漫反射柔和，暖色调，适合餐饮与复古场景。'}
          </div>
        </div>

        <div className="panel">
          <h3>尺寸（mm）</h3>
          <div className="field">
            <label>宽度：{board.widthMm}</label>
            <input
              type="range"
              min={200}
              max={2000}
              step={10}
              value={board.widthMm}
              onChange={(e) => patch({ widthMm: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>高度：{board.heightMm}</label>
            <input
              type="range"
              min={150}
              max={1200}
              step={10}
              value={board.heightMm}
              onChange={(e) => patch({ heightMm: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>板厚：{board.thicknessMm}</label>
            <input
              type="range"
              min={8}
              max={50}
              step={1}
              value={board.thicknessMm}
              onChange={(e) => patch({ thicknessMm: Number(e.target.value) })}
            />
          </div>
          <div className="row">
            <div className="field">
              <label>宽 (mm)</label>
              <input
                type="number"
                value={board.widthMm}
                onChange={(e) => patch({ widthMm: Math.max(100, Number(e.target.value) || 100) })}
              />
            </div>
            <div className="field">
              <label>高 (mm)</label>
              <input
                type="number"
                value={board.heightMm}
                onChange={(e) => patch({ heightMm: Math.max(100, Number(e.target.value) || 100) })}
              />
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>颜色</h3>
          <div className="field">
            <label>背板底色</label>
            <input type="color" value={board.color} onChange={(e) => patch({ color: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="center-col">
        <div className="stat-cards" style={{ marginBottom: 0 }}>
          <div className="stat-card">
            <div className="value mono">
              {board.widthMm}×{board.heightMm}
            </div>
            <div className="label">板面尺寸 mm</div>
          </div>
          <div className="stat-card">
            <div className="value">{((board.widthMm * board.heightMm) / 1_000_000).toFixed(2)}</div>
            <div className="label">面积 m²</div>
          </div>
          <div className="stat-card">
            <div className="value">{BOARD_MATERIALS.find((m) => m.id === board.material)?.name}</div>
            <div className="label">材质</div>
          </div>
          <div className="stat-card">
            <div className="value">{order.runs.length}</div>
            <div className="label">灯管段数</div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Viewer3D
            runs={order.runs}
            board={board}
            mode="layout"
            bloomStrength={settings.bloomStrength}
            quality={settings.quality}
            showFps
          />
        </div>
      </div>

      <div className="side-col">
        <div className="panel">
          <h3>墙面与安装</h3>
          <div className="field">
            <label>墙面颜色</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {WALL_COLORS.map((c) => (
                <button
                  key={c}
                  className="small"
                  style={{
                    background: c,
                    width: 36,
                    height: 36,
                    padding: 0,
                    border: board.wallColor === c ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
                  }}
                  onClick={() => patch({ wallColor: c })}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div className="field">
            <label>自定义墙面颜色</label>
            <input
              type="color"
              value={board.wallColor}
              onChange={(e) => patch({ wallColor: e.target.value })}
            />
          </div>
          <div className="field">
            <label>离墙距离 mm：{board.wallDistanceMm}</label>
            <input
              type="range"
              min={20}
              max={200}
              value={board.wallDistanceMm}
              onChange={(e) => patch({ wallDistanceMm: Number(e.target.value) })}
            />
            <div className="muted" style={{ fontSize: 11 }}>
              离墙越远，墙面光晕扩散范围越大。
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>提示</h3>
          <div className="muted" style={{ fontSize: 12 }}>
            调整尺寸后若出现「越界」校验，请回到
            <button className="ghost small" onClick={() => navigate('/layout')}>
              灯管排线
            </button>
            页重新生成或一键修复。
          </div>
          <button
            className="primary small"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => {
              toast('背板配置已自动保存到订单', 'ok');
              navigate('/preview');
            }}
          >
            前往夜景预览 →
          </button>
        </div>
      </div>
    </div>
  );
}
