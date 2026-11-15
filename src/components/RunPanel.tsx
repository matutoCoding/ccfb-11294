import type { TubeRun, ValidationIssue } from '../types';
import { colorById, NEON_COLORS } from '../constants';

interface Props {
  runs: TubeRun[];
  issues: ValidationIssue[];
  selectedRunId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateRun: (id: string, patch: Partial<TubeRun>) => void;
  onAutoFix: () => void;
  fixing: boolean;
  totalLengthMm: number;
}

const KIND_NAME: Record<ValidationIssue['kind'], string> = {
  'self-intersection': '自交',
  'min-radius': '半径不足',
  overlap: '间距过近',
  'off-board': '越界',
  'short-spur': '短枝',
};

export default function RunPanel({
  runs,
  issues,
  selectedRunId,
  onSelect,
  onUpdateRun,
  onAutoFix,
  fixing,
  totalLengthMm,
}: Props) {
  const autoFixable = issues.some((i) => i.autoFixable);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <>
      <div className="panel">
        <h3>几何校验</h3>
        {issues.length === 0 ? (
          <div className="badge ok" style={{ fontSize: 12 }}>
            ✓ 路径无自交，弯管半径与间距均满足设定
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
              {errors.length > 0 && <span className="badge danger">{errors.length} 项错误</span>}
              {warnings.length > 0 && <span className="badge warn">{warnings.length} 项提示</span>}
            </div>
            <div className="scroll-y" style={{ maxHeight: 240 }}>
              {[...errors, ...warnings].map((iss) => (
                <div
                  key={iss.id}
                  className={`issue-item ${iss.severity === 'error' ? 'danger' : 'warn'}`}
                  onClick={() => iss.runId && onSelect(iss.runId)}
                  style={{ cursor: iss.runId ? 'pointer' : 'default' }}
                >
                  <div className="msg">
                    <span className={`badge ${iss.severity === 'error' ? 'danger' : 'warn'}`}>
                      {KIND_NAME[iss.kind]}
                    </span>{' '}
                    {iss.message}
                  </div>
                </div>
              ))}
            </div>
            <button className="primary small" style={{ width: '100%', marginTop: 8 }} disabled={!autoFixable || fixing} onClick={onAutoFix}>
              {fixing ? '修复中…' : '一键自动修复'}
            </button>
            {errors.length === 0 && (
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                剩余为工艺提示，不影响出管：可在左侧调大字间距/管间距后重新生成
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel" style={{ flex: 1, minHeight: 200, display: 'flex', flexDirection: 'column' }}>
        <h3>
          灯管段（{runs.length}）· 总长 {(totalLengthMm / 1000).toFixed(2)}m
        </h3>
        <div className="scroll-y" style={{ flex: 1 }}>
          {runs.length === 0 && <div className="muted" style={{ fontSize: 12 }}>尚未生成灯管路径</div>}
          {runs.map((run) => {
            const preset = colorById(run.colorId);
            const selected = run.id === selectedRunId;
            return (
              <div
                key={run.id}
                onClick={() => onSelect(selected ? null : run.id)}
                style={{
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'rgba(56,189,248,0.08)' : 'var(--bg-input)',
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    className="color-swatch"
                    style={{ width: 16, height: 16, background: preset.core, boxShadow: `0 0 8px ${preset.glow}` }}
                  />
                  <b style={{ fontSize: 12 }}>第 {run.order + 1} 段</b>
                  <span className="muted mono" style={{ fontSize: 11, marginLeft: 'auto' }}>
                    {(run.lengthMm / 1000).toFixed(2)}m · R{run.minRadiusMm.toFixed(0)}
                  </span>
                </div>
                {selected && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <label style={{ marginTop: 6 }}>颜色</label>
                    <select
                      value={run.colorId}
                      onChange={(e) => onUpdateRun(run.id, { colorId: e.target.value })}
                    >
                      {NEON_COLORS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <label style={{ marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!run.broken}
                        onChange={(e) =>
                          onUpdateRun(run.id, { broken: e.target.checked ? { startT: 0.42, endT: 0.56 } : null })
                        }
                        style={{ width: 'auto', marginRight: 6 }}
                      />
                      模拟该段接触不良
                    </label>
                    {run.broken && (
                      <div>
                        <label>故障位置 {Math.round(run.broken.startT * 100)}% - {Math.round(run.broken.endT * 100)}%</label>
                        <input
                          type="range"
                          min={0}
                          max={90}
                          value={Math.round(run.broken.startT * 100)}
                          onChange={(e) => {
                            const s = Number(e.target.value) / 100;
                            onUpdateRun(run.id, {
                              broken: { startT: s, endT: Math.max(s + 0.08, run.broken!.endT) },
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
