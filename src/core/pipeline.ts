import type {
  DesignSource,
  IssueKind,
  TubeRun,
  ValidationIssue,
  Vec2,
} from '../types';
import { uid } from '../constants';
import {
  catmullRomLength,
  findCrossRunOverlaps,
  findSelfIntersection,
  removeSelfLoops,
  roundCorners,
} from '../lib/geometry';
import { extractRuns } from './skeleton';
import { traceContours } from './contour';
import { labelComponents, zhangSuenThin } from './thinning';
import { pixelRunsToMm, rasterize } from './rasterize';

export interface BuildInput {
  source: DesignSource;
  boardW: number;
  boardH: number;
  bendMinRadiusMm: number;
  spacingMm: number;
  colorId: string;
  diameterMm: number;
}

export interface BuildResult {
  runs: TubeRun[];
  issues: ValidationIssue[];
  stats: { pixels: number; components: number };
}

const ISSUE_LABELS: Record<IssueKind, string> = {
  'self-intersection': '灯管自交',
  'min-radius': '弯管半径不足',
  overlap: '灯管间距过近',
  'off-board': '超出背板边界',
  'short-spur': '残余短枝',
};

export async function buildTubeRuns(input: BuildInput): Promise<BuildResult> {
  const { source, boardW, boardH, bendMinRadiusMm, spacingMm, colorId, diameterMm } = input;

  const raster = await rasterize(source, boardW * 0.92, boardH * 0.88);
  const { count: componentCount } = labelComponents(raster.mask, raster.width, raster.height);

  const useContour = source.type === 'svg' && (source.traceMode ?? 'contour') === 'contour';

  let pixelRuns: Array<{ points: Vec2[]; closed: boolean }>;
  if (useContour) {
    // 填充 SVG：沿外轮廓走闭合管
    pixelRuns = traceContours(raster.mask, raster.width, raster.height).map((l) => ({
      points: l.points,
      closed: true,
    }));
  } else {
    // 文字 / 中轴模式：细化 + 骨架提取
    const skeleton = zhangSuenThin(raster.mask, raster.width, raster.height);
    pixelRuns = extractRuns(skeleton, raster.width, raster.height, 6, 5);
  }
  const mmRuns = pixelRunsToMm(pixelRuns, raster, boardW * 0.92, boardH * 0.88);

  const runs: TubeRun[] = mmRuns.map((run, i) => {
    const closed = run.closed;
    // 去除重复相邻点 → 去环 → 圆角 → 再次去环（圆角可能引入新相交）
    const dedup = run.points.filter(
      (p, k, arr) => k === 0 || Math.hypot(p.x - arr[k - 1].x, p.y - arr[k - 1].y) > 1e-6,
    );
    const safe = closed ? dedup : removeSelfLoops(dedup);
    const rounded0 = roundCorners(safe, bendMinRadiusMm, closed);
    const finalPts = closed ? rounded0.points : removeSelfLoops(rounded0.points);
    const lengthMm = catmullRomLength(finalPts);
    return {
      id: uid('run'),
      order: i,
      points: finalPts,
      colorId,
      diameterMm,
      lengthMm,
      minRadiusMm: rounded0.minRadiusMm,
      closed,
      broken: null,
    };
  }).filter((r) => r.points.length >= 2 && r.lengthMm > 5);

  const issues = validateRuns(runs, { boardW, boardH, bendMinRadiusMm, spacingMm });
  return {
    runs,
    issues,
    stats: { pixels: raster.mask.reduce((a, b) => a + b, 0), components: componentCount },
  };
}

export function validateRuns(
  runs: TubeRun[],
  cfg: { boardW: number; boardH: number; bendMinRadiusMm: number; spacingMm: number },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const halfW = cfg.boardW / 2;
  const halfH = cfg.boardH / 2;
  const margin = 12;

  runs.forEach((run) => {
    const self = findSelfIntersection(run.points, run.closed);
    if (self) {
      issues.push({
        id: uid('iss'),
        kind: 'self-intersection',
        severity: 'error',
        runId: run.id,
        point: self,
        message: `${ISSUE_LABELS['self-intersection']} @ (${self.x.toFixed(0)}, ${self.y.toFixed(0)})mm`,
        autoFixable: true,
      });
    }
    if (isFinite(run.minRadiusMm) && run.minRadiusMm < cfg.bendMinRadiusMm - 0.5) {
      issues.push({
        id: uid('iss'),
        kind: 'min-radius',
        severity: 'warning',
        runId: run.id,
        message: `${ISSUE_LABELS['min-radius']}：几何可达 ${run.minRadiusMm.toFixed(1)}mm < 设定 ${cfg.bendMinRadiusMm}mm，可自动下调设定值`,
        autoFixable: true,
      });
    }
    const off = run.points.find(
      (p) => Math.abs(p.x) > halfW - margin || Math.abs(p.y) > halfH - margin,
    );
    if (off) {
      issues.push({
        id: uid('iss'),
        kind: 'off-board',
        severity: 'error',
        runId: run.id,
        point: off,
        message: `${ISSUE_LABELS['off-board']}：灯管越过背板安全边距 ${margin}mm`,
        autoFixable: true,
      });
    }
  });

  const overlaps = findCrossRunOverlaps(
    runs.map((r) => ({ id: r.id, points: r.points })),
    cfg.spacingMm,
  );
  for (const o of overlaps) {
    issues.push({
      id: uid('iss'),
      kind: 'overlap',
      severity: 'warning',
      runId: o.runIdA,
      point: o.point,
      message: `${ISSUE_LABELS.overlap}：两段灯管间距小于 ${cfg.spacingMm}mm（密笔画工艺提示，可调大字号或管间距）`,
      autoFixable: false,
    });
  }
  return issues;
}

/**
 * 自动修复（最多 3 轮）：
 * 1. 自交段抽稀重建  2. 不足半径重新圆角（降级半径）  3. 越界整体等比缩小
 */
export function autoFix(
  runs: TubeRun[],
  cfg: { boardW: number; boardH: number; bendMinRadiusMm: number; spacingMm: number },
): { runs: TubeRun[]; issues: ValidationIssue[]; applied: string[]; effectiveMinRadiusMm: number } {
  const applied: string[] = [];
  let current = runs.map((r) => ({ ...r, points: r.points.map((p) => ({ ...p })) }));
  const effCfg = { ...cfg };

  // 修复 0：若存在半径不可达，先把设定半径下调到全局几何可达值
  const reachable = Math.min(
    ...current.map((r) => (isFinite(r.minRadiusMm) ? r.minRadiusMm : Infinity)),
  );
  if (isFinite(reachable) && reachable < cfg.bendMinRadiusMm - 0.5) {
    effCfg.bendMinRadiusMm = Math.max(1, Math.round(reachable * 10) / 10);
    applied.push(`最小弯管半径按几何可达下调为 ${effCfg.bendMinRadiusMm.toFixed(1)}mm`);
  }

  for (let round = 0; round < 3; round++) {
    let issues = validateRuns(current, effCfg);
    if (issues.length === 0) break;

    // 修复 1：自交 -> 增大抽稀后重做圆角
    const selfIds = new Set(issues.filter((i) => i.kind === 'self-intersection').map((i) => i.runId));
    if (selfIds.size > 0) {
      current = current.map((r) => {
        if (!selfIds.has(r.id)) return r;
        const sparser = dropEveryOther(r.points);
        const rounded = roundCorners(sparser, effCfg.bendMinRadiusMm, isClosed(r.points));
        return {
          ...r,
          points: rounded.points,
          minRadiusMm: rounded.minRadiusMm,
          lengthMm: catmullRomLength(rounded.points),
        };
      });
      applied.push('对自交灯管重新抽稀并圆角');
      issues = validateRuns(current, effCfg);
    }

    // 修复 2：半径不足 -> 以实际可达半径重新圆角（下限 1mm）
    const radiusIds = new Set(issues.filter((i) => i.kind === 'min-radius').map((i) => i.runId));
    if (radiusIds.size > 0) {
      current = current.map((r) => {
        if (!radiusIds.has(r.id)) return r;
        const target = Math.max(1, r.minRadiusMm);
        const rounded = roundCorners(r.points, target, isClosed(r.points));
        return { ...r, points: rounded.points, minRadiusMm: rounded.minRadiusMm };
      });
      applied.push('按可达上限重算弯管圆弧');
      issues = validateRuns(current, effCfg);
    }

    // 修复 3：越界 -> 整体等比缩小到安全区
    if (issues.some((i) => i.kind === 'off-board')) {
      const halfW = cfg.boardW / 2 - 12;
      const halfH = cfg.boardH / 2 - 12;
      let maxRatio = 0;
      for (const r of current) {
        for (const p of r.points) {
          maxRatio = Math.max(maxRatio, Math.abs(p.x) / halfW, Math.abs(p.y) / halfH);
        }
      }
      if (maxRatio > 1) {
        const s = 1 / maxRatio;
        current = current.map((r) => ({
          ...r,
          points: r.points.map((p) => ({ x: p.x * s, y: p.y * s })),
          lengthMm: r.lengthMm * s,
        }));
        applied.push(`整体缩小至 ${(s * 100).toFixed(1)}% 以回到背板内`);
      }
    }
  }

  return {
    runs: current,
    issues: validateRuns(current, effCfg),
    applied,
    effectiveMinRadiusMm: effCfg.bendMinRadiusMm,
  };
}

function isClosed(points: Vec2[]): boolean {
  const a = points[0];
  const b = points[points.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) < 1;
}

function dropEveryOther(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i += 2) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
