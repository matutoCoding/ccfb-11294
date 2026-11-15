import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Order, TubeRun, ValidationIssue } from '../types';
import { useOrderStore, useSettingsStore } from '../store/useStores';
import { useToast } from '../components/toast';
import SourcePanel from '../components/SourcePanel';
import RunPanel from '../components/RunPanel';
import Viewer3D, { type Viewer3DHandle } from '../components/Viewer3D';
import { autoFix, buildTubeRuns, validateRuns } from '../core/pipeline';
import { formatM } from '../lib/util';

export default function LayoutPage() {
  const orders = useOrderStore((s) => s.orders);
  const currentId = useOrderStore((s) => s.currentId);
  const upsert = useOrderStore((s) => s.upsert);
  const create = useOrderStore((s) => s.create);
  const settings = useSettingsStore((s) => s.settings);
  const toast = useToast();
  const navigate = useNavigate();
  const viewerRef = useRef<Viewer3DHandle>(null);

  const order: Order | undefined = orders.find((o) => o.id === currentId);
  const [building, setBuilding] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [colorId, setColorId] = useState('neon-red');
  const [diameterMm, setDiameterMm] = useState(settings.defaultTubeDiameterMm);

  // 没有订单时自动建一个
  useEffect(() => {
    if (!order) {
      const o = create();
      navigate('/layout');
      toast(`已创建订单「${o.name}」`, 'ok');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换订单后同步本地状态
  useEffect(() => {
    if (order?.runs.length) {
      setColorId(order.runs[0].colorId);
      setDiameterMm(order.runs[0].diameterMm);
      setIssues(
        validateRuns(order.runs, {
          boardW: order.board.widthMm,
          boardH: order.board.heightMm,
          bendMinRadiusMm: order.bendMinRadiusMm,
          spacingMm: order.spacingMm,
        }),
      );
    } else if (order) {
      setIssues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const totalLength = useMemo(
    () => (order ? order.runs.reduce((a, r) => a + r.lengthMm, 0) : 0),
    [order],
  );
  const minRadius =
    order && order.runs.length
      ? Math.min(...order.runs.filter((r) => isFinite(r.minRadiusMm)).map((r) => r.minRadiusMm))
      : null;

  if (!order) {
    return <div className="empty">正在初始化订单…</div>;
  }

  const patchOrder = (patch: Partial<Order>) => {
    upsert({ ...order, ...patch });
  };

  const handleBuild = async () => {
    setBuilding(true);
    try {
      const result = await buildTubeRuns({
        source: order.source,
        boardW: order.board.widthMm,
        boardH: order.board.heightMm,
        bendMinRadiusMm: order.bendMinRadiusMm,
        spacingMm: order.spacingMm,
        colorId,
        diameterMm,
      });
      const runs: TubeRun[] = result.runs.map((r, i) => ({ ...r, order: i }));
      upsert({ ...order, runs });
      setIssues(result.issues);
      setSelectedRunId(null);
      toast(
        result.issues.length === 0
          ? `排管完成：${runs.length} 段，总长 ${formatM(runs.reduce((a, r) => a + r.lengthMm, 0))}`
          : `排管完成，${result.issues.filter((i) => i.severity === 'error').length} 项错误 / ${result.issues.filter((i) => i.severity === 'warning').length} 项提示`,
        result.issues.some((i) => i.severity === 'error') ? 'err' : 'ok',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : '排管失败', 'err');
    } finally {
      setBuilding(false);
    }
  };

  const handleAutoFix = () => {
    setFixing(true);
    setTimeout(() => {
      try {
        const result = autoFix(order.runs, {
          boardW: order.board.widthMm,
          boardH: order.board.heightMm,
          bendMinRadiusMm: order.bendMinRadiusMm,
          spacingMm: order.spacingMm,
        });
        const next: Order = {
          ...order,
          runs: result.runs,
          bendMinRadiusMm: result.effectiveMinRadiusMm,
        };
        upsert(next);
        setIssues(
          validateRuns(result.runs, {
            boardW: order.board.widthMm,
            boardH: order.board.heightMm,
            bendMinRadiusMm: result.effectiveMinRadiusMm,
            spacingMm: order.spacingMm,
          }),
        );
        toast(
          result.applied.length
            ? `已应用：${result.applied.join('；')}，剩余 ${result.issues.length} 项`
            : '没有可自动修复的问题',
          result.issues.length === 0 ? 'ok' : 'info',
        );
      } finally {
        setFixing(false);
      }
    }, 30);
  };

  const updateRun = (id: string, patch: Partial<TubeRun>) => {
    const runs = order.runs.map((r) => (r.id === id ? { ...r, ...patch } : r));
    upsert({ ...order, runs });
    const eng = viewerRef.current?.engine();
    if (eng) {
      const target = runs.find((r) => r.id === id);
      if (target?.broken) eng.setRunBroken(id, target.broken.startT, target.broken.endT);
      if (target && !target.broken) eng.setRunBroken(id, -1, -1);
    }
  };

  return (
    <div className="layout-workbench">
      <div className="side-col">
        <SourcePanel
          order={order}
          colorId={colorId}
          diameterMm={diameterMm}
          onColor={setColorId}
          onDiameter={setDiameterMm}
          onChange={patchOrder}
          onBuild={() => void handleBuild()}
          building={building}
        />
      </div>

      <div className="center-col">
        <div className="stat-cards" style={{ marginBottom: 0 }}>
          <div className="stat-card">
            <div className="value">{order.runs.length}</div>
            <div className="label">灯管段数</div>
          </div>
          <div className="stat-card">
            <div className="value">{formatM(totalLength)}</div>
            <div className="label">灯管总长</div>
          </div>
          <div className="stat-card">
            <div className="value">
              {minRadius === null ? '—' : minRadius.toFixed(1)}
              <span className="label"> mm</span>
            </div>
            <div className="label">实际最小弯管半径（设定 {order.bendMinRadiusMm}）</div>
          </div>
          <div className="stat-card">
            <div className="value">
              <span className={issues.some((i) => i.severity === 'error') ? 'badge danger' : 'badge ok'} style={{ fontSize: 18 }}>
                {issues.filter((i) => i.severity === 'error').length} 错 / {issues.filter((i) => i.severity === 'warning').length} 提示
              </span>
            </div>
            <div className="label">几何校验</div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Viewer3D
            ref={viewerRef}
            runs={order.runs}
            board={order.board}
            mode="layout"
            bloomStrength={settings.bloomStrength}
            quality={settings.quality}
            showFps
            onReady={(eng) => {
              eng.setMode('layout');
              if (selectedRunId) eng.setRunHighlight(selectedRunId);
            }}
          />
        </div>
      </div>

      <div className="side-col">
        <RunPanel
          runs={order.runs}
          issues={issues}
          selectedRunId={selectedRunId}
          onSelect={(id) => {
            setSelectedRunId(id);
            viewerRef.current?.engine()?.setRunHighlight(id);
          }}
          onUpdateRun={updateRun}
          onAutoFix={handleAutoFix}
          fixing={fixing}
          totalLengthMm={totalLength}
        />
        <button className="small" onClick={() => navigate('/preview')} disabled={order.runs.length === 0}>
          前往夜景预览 →
        </button>
      </div>
    </div>
  );
}
