import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { NeonEngine, type EngineMode } from '../engine/NeonEngine';
import type { AnimationConfig, BoardConfig, TubeRun } from '../types';

export interface Viewer3DHandle {
  engine: () => NeonEngine | null;
}

interface Viewer3DProps {
  runs: TubeRun[];
  board: BoardConfig;
  animation?: AnimationConfig;
  mode: EngineMode;
  bloomStrength: number;
  quality: 'auto' | 'low' | 'high';
  showFps?: boolean;
  onReady?: (engine: NeonEngine) => void;
  height?: string | number;
}

const Viewer3D = forwardRef<Viewer3DHandle, Viewer3DProps>(function Viewer3D(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<NeonEngine | null>(null);
  const [fps, setFps] = useState(60);
  const [downgraded, setDowngraded] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  useImperativeHandle(ref, () => ({ engine: () => engineRef.current }), []);

  // 引擎只创建一次
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new NeonEngine(containerRef.current, {
      bloomStrength: propsRef.current.bloomStrength,
      quality: propsRef.current.quality,
    });
    engineRef.current = engine;
    engine.onFps = (v) => setFps(v);
    propsRef.current.onReady?.(engine);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据同步
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.loadOrder({
      id: 'viewer',
      name: '',
      createdAt: 0,
      updatedAt: 0,
      source: { type: 'text', text: '', fontFamily: '', bold: false, fontSizeMm: 10, letterSpacingMm: 0 },
      board: props.board,
      bendMinRadiusMm: 0,
      spacingMm: 0,
      runs: props.runs,
      animation: props.animation ?? {
        mode: 'steady',
        speed: 1,
        flickerHz: 9,
        chaseCycleSec: 2.4,
        intensity: 1,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.runs, props.board]);

  useEffect(() => {
    engineRef.current?.setMode(props.mode);
  }, [props.mode]);

  useEffect(() => {
    if (props.animation) engineRef.current?.setAnimation(props.animation);
  }, [props.animation]);

  useEffect(() => {
    engineRef.current?.setBloomStrength(props.bloomStrength);
  }, [props.bloomStrength]);

  useEffect(() => {
    engineRef.current?.setQuality(props.quality);
    setDowngraded(false);
  }, [props.quality]);

  const fpsBad = fps < 50;
  return (
    <div className="viewer" style={{ height: props.height ?? '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {props.showFps && (
        <div className="viewer-hud">
          <span className="hud-chip">
            FPS <b style={{ color: fpsBad ? 'var(--warn)' : undefined }}>{fps.toFixed(0)}</b>
          </span>
          <span className="hud-chip">{props.runs.length} 段灯管</span>
          {downgraded && <span className="hud-chip">已自动降质</span>}
        </div>
      )}
      <div className="viewer-tools">
        <button
          className="small"
          onClick={() => engineRef.current?.resetView()}
          title="复位视角"
        >
          复位视角
        </button>
      </div>
    </div>
  );
});

export default Viewer3D;
