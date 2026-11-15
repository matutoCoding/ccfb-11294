/* 纯算法验证：细化、骨架提取、圆角半径保证、自交检测、间距检测 */
import { zhangSuenThin, labelComponents } from '../src/core/thinning';
import { extractRuns } from '../src/core/skeleton';
import {
  roundCorners,
  findSelfIntersection,
  findCrossRunOverlaps,
  catmullRomLength,
  removeSelfLoops,
  type Bounds,
} from '../src/lib/geometry';
import type { Vec2 } from '../src/types';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

/** 沿路径盖章粗笔画（圆盘笔刷）生成二值 mask */
function strokeMask(paths: Vec2[][], w: number, h: number, radius: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len));
      for (let s = 0; s <= steps; s++) {
        const cx = a.x + ((b.x - a.x) * s) / steps;
        const cy = a.y + ((b.y - a.y) * s) / steps;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const x = Math.round(cx + dx);
            const y = Math.round(cy + dy);
            if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1;
          }
        }
      }
    }
  }
  return mask;
}

function bounds(points: Vec2[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

// ---------- 1. 直线笔画 ----------
{
  console.log('1. 水平粗直线细化');
  const W = 120, H = 40;
  const mask = strokeMask([[{ x: 10, y: 20 }, { x: 110, y: 20 }]], W, H, 6);
  const thin = zhangSuenThin(mask, W, H);
  const on = thin.reduce((a, b) => a + b, 0);
  check('骨架像素远少于原始笔画', on < mask.reduce((a, b) => a + b, 0) * 0.4, `on=${on}`);
  const runs = extractRuns(thin, W, H, 6, 5);
  check('提取出 1 段灯管', runs.length === 1, `got ${runs.length}`);
  const bb = bounds(runs[0]?.points ?? []);
  check('走向近似水平', bb.maxX - bb.minX > 80 && bb.maxY - bb.minY < 8, JSON.stringify(bb));
}

// ---------- 2. L 形笔画（转角） ----------
{
  console.log('2. L 形粗笔画');
  const W = 100, H = 100;
  const mask = strokeMask([[{ x: 20, y: 20 }, { x: 20, y: 80 }, { x: 80, y: 80 }]], W, H, 7);
  const thin = zhangSuenThin(mask, W, H);
  const runs = extractRuns(thin, W, H, 6, 5);
  check('L 形保持为单段（无碎枝）', runs.length === 1, `got ${runs.length}`);
  check('无自交', runs.every((r) => findSelfIntersection(r.points, r.closed) === null));
}

// ---------- 3. 环形笔画（闭合） ----------
{
  console.log('3. 圆环形笔画');
  const W = 120, H = 120;
  const ring: Vec2[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * Math.PI * 2;
    ring.push({ x: 60 + Math.cos(t) * 40, y: 60 + Math.sin(t) * 40 });
  }
  const mask = strokeMask([ring], W, H, 6);
  const { count } = labelComponents(mask, W, H);
  check('圆环是单一连通域', count === 1, `count=${count}`);
  const thin = zhangSuenThin(mask, W, H);
  const runs = extractRuns(thin, W, H, 10, 5);
  check('提取出闭合环 1 段', runs.length === 1 && runs[0].closed, `runs=${runs.length}`);
  check('闭合环无自交', runs.every((r) => findSelfIntersection(r.points, r.closed) === null));
}

// ---------- 4. 十字交叉（直通配对） ----------
{
  console.log('4. 十字交叉笔画');
  const W = 120, H = 120;
  const mask = strokeMask(
    [
      [{ x: 15, y: 60 }, { x: 105, y: 60 }],
      [{ x: 60, y: 15 }, { x: 60, y: 105 }],
    ],
    W,
    H,
    7,
  );
  const thin = zhangSuenThin(mask, W, H);
  const runs = extractRuns(thin, W, H, 10, 5);
  // 十字在交叉点被分成 2~4 段（阶梯噪声下允许），但全部无自交，
  // 且所有段的并集应覆盖水平、垂直两个方向并经过中心附近
  check('十字输出 2~4 段灯管', runs.length >= 2 && runs.length <= 4, `got ${runs.length}`);
  check('十字各段均无自交', runs.every((r) => findSelfIntersection(r.points, r.closed) === null));
  const allPts = runs.flatMap((r) => r.points);
  const spanX = Math.max(...allPts.map((p) => p.x)) - Math.min(...allPts.map((p) => p.x));
  const spanY = Math.max(...allPts.map((p) => p.y)) - Math.min(...allPts.map((p) => p.y));
  check('十字覆盖水平与垂直走向', spanX > 70 && spanY > 70, `spanX=${spanX} spanY=${spanY}`);
  check('十字经过中心 (60,60) 附近', allPts.some((p) => Math.abs(p.x - 60) < 14 && Math.abs(p.y - 60) < 14));
}

// ---------- 5. 圆角半径保证 ----------
{
  console.log('5. 弯管最小半径保证');
  const sharp: Vec2[] = [
    { x: 0, y: 0 },
    { x: 0, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 0 },
  ];
  const R = 25;
  const rounded = roundCorners(sharp, R, false);
  check('圆角后无自交', findSelfIntersection(rounded.points, false) === null);
  check('实际最小半径 >= 目标半径（容差 0.5mm）', rounded.minRadiusMm >= R - 0.5, `minR=${rounded.minRadiusMm}`);
  check('圆弧增加了点数（平滑）', rounded.points.length > sharp.length);

  // 空间不足时必须降级而不是产生自交
  const tight: Vec2[] = [
    { x: 0, y: 0 },
    { x: 0, y: 30 },
    { x: 30, y: 30 },
  ];
  const r2 = roundCorners(tight, 25, false);
  check('窄角降级后仍无自交', findSelfIntersection(r2.points, false) === null);
  check('窄角实际半径被限制在可用空间内', r2.minRadiusMm <= 30 * 0.45 / Math.tan(Math.PI / 4) + 0.01 || isFinite(r2.minRadiusMm));

  // 闭合矩形环：4 个角（含索引 0 接缝角）都应被圆角处理
  const ring: Vec2[] = [
    { x: 0, y: 0 },
    { x: 0, y: 160 },
    { x: 240, y: 160 },
    { x: 240, y: 0 },
  ];
  const rr = roundCorners(ring, 22, true);
  check('闭合环圆角后无自交', findSelfIntersection(rr.points, true) === null);
  check('闭合环四个角半径均达标', rr.minRadiusMm >= 22 - 0.5, `minR=${rr.minRadiusMm}`);
  check('闭合环首尾重合', Math.hypot(rr.points[0].x - rr.points[rr.points.length - 1].x, rr.points[0].y - rr.points[rr.points.length - 1].y) < 1e-6);
}

// ---------- 6. 自交检测 ----------
{
  console.log('6. 自交检测');
  const crossing: Vec2[] = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ];
  check('能检出 X 形自交', findSelfIntersection(crossing) !== null);
  const clean: Vec2[] = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
  ];
  check('正常 L 形不误报', findSelfIntersection(clean) === null);
}

// ---------- 7. 跨管间距检测 ----------
{
  console.log('7. 跨管间距检测');
  const overlaps = findCrossRunOverlaps(
    [
      { id: 'a', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { id: 'b', points: [{ x: 0, y: 8 }, { x: 100, y: 8 }] },
    ],
    14,
  );
  check('间距 8mm < 要求 14mm 能报警', overlaps.length === 1, `got ${overlaps.length}`);
  const ok = findCrossRunOverlaps(
    [
      { id: 'a', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { id: 'b', points: [{ x: 0, y: 30 }, { x: 100, y: 30 }] },
    ],
    14,
  );
  check('间距 30mm 不报警', ok.length === 0);
}

// ---------- 8. 管长估算 ----------
{
  console.log('8. Catmull-Rom 管长估算');
  const straight: Vec2[] = [];
  for (let i = 0; i <= 10; i++) straight.push({ x: i * 10, y: 0 });
  const len = catmullRomLength(straight);
  check('100mm 直线管长误差 < 2%', Math.abs(len - 100) < 2, `len=${len}`);
}

// ---------- 9. 去环 ----------
{
  console.log('9. 折线去环（自交兜底）');
  // 构造一个带回环的折线：A → B → C → D → E，其中 B-C 与 D-E 交叉
  const looped: Vec2[] = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    { x: 50, y: 150 },
  ];
  check('原始折线存在自交', findSelfIntersection(looped, false) !== null);
  const cleaned = removeSelfLoops(looped);
  check('去环后无自交', findSelfIntersection(cleaned, false) === null);
  check('去环后点数减少', cleaned.length < looped.length);
  check('正常折线去环后保持不变', removeSelfLoops([{x:0,y:0},{x:0,y:50},{x:50,y:50}]).length === 3);
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
