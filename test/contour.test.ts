/* 轮廓追踪验证 */
import { traceContours } from '../src/core/contour';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

/** 实心圆盘掩码 */
function disc(w: number, h: number, cx: number, cy: number, r: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (Math.hypot(x - cx, y - cy) <= r) m[y * w + x] = 1;
  }
  return m;
}

function rect(w: number, h: number, x0: number, y0: number, rw: number, rh: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) m[y * w + x] = 1;
  return m;
}

// 1. 单个圆盘 → 1 条闭合轮廓
{
  console.log('1. 单圆盘轮廓');
  const m = disc(120, 120, 60, 60, 40);
  const loops = traceContours(m, 120, 120);
  check('输出 1 条环', loops.length === 1, `got ${loops.length}`);
  check('标记为闭合', loops[0]?.closed === true);
  check('轮廓点数合理 (>20)', (loops[0]?.points.length ?? 0) > 20);
  const xs = loops[0]?.points.map((p) => p.x) ?? [];
  const ys = loops[0]?.points.map(p=>p.y) ?? [];
  check('轮廓包围圆盘', Math.min(...xs) < 25 && Math.max(...xs) > 95, `x ${Math.min(...xs)}..${Math.max(...xs)}`);
  check('首尾重合', (() => { const l = loops[0]; if(!l) return false; const a=l.points[0], b=l.points[l.points.length-1]; return a.x===b.x&&a.y===b.y; })());
}

// 2. 两个分离圆盘 → 2 条环
{
  console.log('2. 双分离圆盘轮廓');
  const m = new Uint8Array(200 * 120);
  const d1 = disc(200, 120, 50, 60, 30);
  const d2 = disc(200, 120, 150, 60, 30);
  for (let i = 0; i < m.length; i++) m[i] = d1[i] || d2[i];
  const loops = traceContours(m, 200, 120);
  check('输出 2 条环', loops.length === 2, `got ${loops.length}`);
  check('都闭合', loops.every((l) => l.closed));
}

// 3. 矩形轮廓 → 1 条环，4 条边
{
  console.log('3. 矩形轮廓');
  const m = rect(120, 120, 30, 30, 60, 50);
  const loops = traceContours(m, 120, 120);
  check('输出 1 条环', loops.length === 1, `got ${loops.length}`);
  check('RDP 抽稀后点数 <= 8', (loops[0]?.points.length ?? 99) <= 8, `pts=${loops[0]?.points.length}`);
}

// 4. 两个相切圆盘（共享一点）→ 仍应得到 2 条外轮廓或 1 条连续外边界，且无自交
{
  console.log('4. 相切圆盘');
  const m = new Uint8Array(200 * 120);
  const d1 = disc(200, 120, 50, 60, 30);
  const d2 = disc(200, 120, 110, 60, 30);
  for (let i = 0; i < m.length; i++) m[i] = d1[i] || d2[i];
  const loops = traceContours(m, 200, 120);
  check('至少 1 条环', loops.length >= 1, `got ${loops.length}`);
  check('全部闭合', loops.every((l) => l.closed));
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);
