import type { Vec2 } from '../types';

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function normalize(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-9 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function cross2(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function polylineLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: Vec2[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Ramer–Douglas–Peucker 折线抽稀 */
export function rdp(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxD = 0;
    let index = -1;
    const a = points[first];
    const b = points[last];
    const ab = sub(b, a);
    const abLen2 = ab.x * ab.x + ab.y * ab.y;
    for (let i = first + 1; i < last; i++) {
      const ap = sub(points[i], a);
      const d =
        abLen2 < 1e-12
          ? Math.hypot(ap.x, ap.y)
          : Math.abs(cross2(ab, ap)) / Math.sqrt(abLen2);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index > -1 && maxD > epsilon) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** 线段是否真正相交（忽略共端点） */
export function segmentsProperlyIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1 = cross2(sub(p4, p3), sub(p1, p3));
  const d2 = cross2(sub(p4, p3), sub(p2, p3));
  const d3 = cross2(sub(p2, p1), sub(p3, p1));
  const d4 = cross2(sub(p2, p1), sub(p4, p1));
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

/** 检测单条折线自交，返回第一个交点（相邻段忽略；closed 时首尾段视为相邻） */
export function findSelfIntersection(points: Vec2[], closed = false): Vec2 | null {
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (closed && i === 0 && j === n - 2) continue; // 仅闭合折线豁免首尾相邻
      if (segmentsProperlyIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
        return lineIntersectionPoint(points[i], points[i + 1], points[j], points[j + 1]);
      }
    }
  }
  return null;
}

function lineIntersectionPoint(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 {
  const d = cross2(sub(p2, p1), sub(p4, p3));
  if (Math.abs(d) < 1e-9) return { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const t = cross2(sub(p3, p1), sub(p4, p3)) / d;
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

export interface RoundedResult {
  points: Vec2[];
  minRadiusMm: number;
}

/**
 * 用相切圆弧替换尖角，保证每个转角的实际曲率半径 >= 可达上限。
 * 若两侧边长不足以容纳目标半径，则按可用长度降级并返回实际最小半径。
 */
export function roundCorners(points: Vec2[], minRadiusMm: number, closed = false): RoundedResult {
  const n = points.length;
  if (n < 3 || minRadiusMm <= 0) return { points: points.slice(), minRadiusMm: Infinity };

  const out: Vec2[] = [points[0]];
  let minActual = Infinity;

  /** 计算单个转角的相切圆弧（含起止点 a..b）；直线转角返回 null */
  function arcAt(i: number): { arc: Vec2[]; radius: number } | null {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i % n];
    const next = points[(i + 1) % n];
    const u = normalize(sub(cur, prev));
    const v = normalize(sub(next, cur));
    const cosA = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    const theta = Math.acos(cosA); // 偏转角，0=直行
    if (theta < 0.02) return null;
    // 近 180° 急转：物理上可弯的最小半径（不小于管径量级），保留尖点但给出下限
    if (theta > Math.PI - 0.02) return { arc: [cur], radius: 1 };

    const room = Math.min(dist(prev, cur), dist(cur, next)) * 0.45;
    const tanHalf = Math.tan(theta / 2);
    const tangent = Math.min(minRadiusMm / tanHalf, room);
    const radius = tangent * tanHalf;

    const a: Vec2 = { x: cur.x - u.x * tangent, y: cur.y - u.y * tangent };
    const b: Vec2 = { x: cur.x + v.x * tangent, y: cur.y + v.y * tangent };
    const bisector = normalize(add(scale(u, -1), v));
    const centerDist = radius / Math.sin(theta / 2);
    const center: Vec2 = { x: cur.x + bisector.x * centerDist, y: cur.y + bisector.y * centerDist };

    const a0 = Math.atan2(a.y - center.y, a.x - center.x);
    const a1 = Math.atan2(b.y - center.y, b.x - center.x);
    const turnSign = cross2(u, v) >= 0 ? 1 : -1;
    let sweep = a1 - a0;
    if (turnSign > 0 && sweep < 0) sweep += Math.PI * 2;
    if (turnSign < 0 && sweep > 0) sweep -= Math.PI * 2;

    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 10)));
    const arc: Vec2[] = [];
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + (sweep * k) / steps;
      arc.push({ x: center.x + Math.cos(ang) * radius, y: center.y + Math.sin(ang) * radius });
    }
    return { arc, radius };
  }

  // 开放折线：转角 1..n-2；闭合环：1..n-1，索引 0 接缝角最后补
  const lastCorner = closed ? n - 1 : n - 2;
  for (let i = 1; i <= lastCorner; i++) {
    const r = arcAt(i);
    if (!r) {
      out.push(points[i % n]);
      continue;
    }
    minActual = Math.min(minActual, r.radius);
    out.push(...r.arc);
  }

  if (closed) {
    const r0 = arcAt(0);
    if (r0) {
      minActual = Math.min(minActual, r0.radius);
      out.push(...r0.arc);
    }
    out.push(out[0]);
  } else {
    out.push(points[n - 1]);
  }
  return { points: out, minRadiusMm: minActual === Infinity ? minRadiusMm : minActual };
}

/**
 * 折线去环保证不自交：逐段检查，若新线段与更早的非相邻段真正相交，
 * 则删除两者之间的回环（把交点到交点的环移除）。迭代直到无自交。
 * 这是排管“路径不能自交”硬性要求的最终几何兜底。
 */
export function removeSelfLoops(points: Vec2[]): Vec2[] {
  let pts = points.slice();
  for (let pass = 0; pass < 8; pass++) {
    let hit = false;
    for (let i = 0; i < pts.length - 1 && !hit; i++) {
      for (let j = i + 2; j < pts.length - 1; j++) {
        if (segmentsProperlyIntersect(pts[i], pts[i + 1], pts[j], pts[j + 1])) {
          // 删除 i+1..j 之间的回环，保留交点两侧
          pts = [...pts.slice(0, i + 1), ...pts.slice(j + 1)];
          hit = true;
          break;
        }
      }
    }
    if (!hit) break;
  }
  return pts;
}

/** 用 Catmull-Rom 插值估算平滑后的实际管长 */
export function catmullRomLength(points: Vec2[], samplesPerSegment = 8): number {
  const n = points.length;
  if (n < 2) return 0;
  let total = 0;
  let prev = points[0];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    for (let s = 1; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const q: Vec2 = {
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      };
      total += dist(prev, q);
      prev = q;
    }
  }
  return total;
}

/** 空间哈希：检测不同灯管之间间距是否小于最小管距 */
export function findCrossRunOverlaps(
  runs: Array<{ id: string; points: Vec2[] }>,
  minSpacingMm: number,
  maxReports = 20,
): Array<{ runIdA: string; runIdB: string; point: Vec2 }> {
  const cell = Math.max(minSpacingMm, 1);
  const grid = new Map<string, Array<{ runId: string; p: Vec2 }>>();
  const key = (cx: number, cy: number) => `${cx}|${cy}`;
  const reports: Array<{ runIdA: string; runIdB: string; point: Vec2 }> = [];
  const seen = new Set<string>();

  for (const run of runs) {
    const samples = samplePolyline(run.points, cell * 0.5);
    for (const p of samples) {
      const cx = Math.floor(p.x / cell);
      const cy = Math.floor(p.y / cell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(key(cx + dx, cy + dy));
          if (!bucket) continue;
          for (const other of bucket) {
            if (other.runId === run.id) continue;
            if (dist(other.p, p) < minSpacingMm) {
              const pairKey = [run.id, other.runId].sort().join('~');
              if (seen.has(pairKey)) continue;
              seen.add(pairKey);
              reports.push({ runIdA: run.id, runIdB: other.runId, point: p });
              if (reports.length >= maxReports) return reports;
            }
          }
        }
      }
      const k = key(cx, cy);
      const bucket = grid.get(k);
      if (bucket) bucket.push({ runId: run.id, p });
      else grid.set(k, [{ runId: run.id, p }]);
    }
  }
  return reports;
}

export function samplePolyline(points: Vec2[], stepMm: number): Vec2[] {
  if (points.length < 2) return points.slice();
  const out: Vec2[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segLen = dist(a, b);
    if (segLen < 1e-9) continue;
    const dir = normalize(sub(b, a));
    let d = stepMm - carry;
    while (d <= segLen) {
      out.push({ x: a.x + dir.x * d, y: a.y + dir.y * d });
      d += stepMm;
    }
    carry = segLen - (d - stepMm);
  }
  out.push(points[points.length - 1]);
  return out;
}
