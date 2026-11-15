import type { Vec2 } from '../types';
import { rdp } from '../lib/geometry';

export interface PixelRun {
  points: Vec2[]; // 像素坐标，y 向下
  closed: boolean;
}

const NB: Array<[number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

interface Edge {
  cA: number; // 起点簇 id，-1 为无簇纯环
  cB: number; // 终点簇 id，-1 为无簇 / 开放
  pixels: Vec2[];
  closed: boolean;
}

/**
 * 从单像素骨架提取折线灯管。
 *
 * Zhang-Suen 细化在斜线处产生阶梯像素（8 邻接度 3/4），不能直接按度数建图。
 * 统一策略：
 *   1. 相邻“非度2”像素聚成交叉点簇，度1簇为自由端
 *   2. 从每个簇的对外端口做像素级连续行走，穿过所有像素（含簇），
 *      方向连续性选路，回到起点即闭合，到自由端即结束
 *   3. 无簇的纯环单独行走
 *   4. 短枝迭代修剪
 *   5. 每个簇按最直通走向配对端口，拼接连续灯管
 *   6. RDP 抽稀 + 长度过滤
 */
export function extractRuns(
  skeleton: Uint8Array,
  width: number,
  height: number,
  minRunPx: number,
  spurPrunePx: number,
): PixelRun[] {
  const idx = (x: number, y: number) => y * width + x;
  const at = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < width && y < height ? skeleton[idx(x, y)] : 0;
  const degree = (x: number, y: number): number => {
    let d = 0;
    for (const [dx, dy] of NB) d += at(x + dx, y + dy);
    return d;
  };
  const isNodePx = (x: number, y: number): boolean => at(x, y) === 1 && degree(x, y) !== 2;
  const pxOf = (i: number): Vec2 => ({ x: i % width, y: (i / width) | 0 });

  // 1. 交叉点簇
  const clusterId = new Int32Array(width * height).fill(-1);
  const clusters: { pixels: number[]; isTip: boolean }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(x, y);
      if (!isNodePx(x, y) || clusterId[start] !== -1) continue;
      const cid = clusters.length;
      const pixels: number[] = [];
      const stack = [start];
      clusterId[start] = cid;
      let isTip = false;
      while (stack.length) {
        const cur = stack.pop()!;
        pixels.push(cur);
        const cx = cur % width;
        const cy = (cur / width) | 0;
        if (degree(cx, cy) === 1) isTip = true;
        for (const [dx, dy] of NB) {
          const nx = cx + dx;
          const ny = cy + dy;
          const ni = idx(nx, ny);
          if (isNodePx(nx, ny) && clusterId[ni] === -1) {
            clusterId[ni] = cid;
            stack.push(ni);
          }
        }
      }
      clusters.push({ pixels, isTip });
    }
  }

  const consumed = new Set<number>();
  const edges: Edge[] = [];

  /** 从端口 startPort（度2像素，相邻 anchorCluster）连续行走 */
  const walkFrom = (startPort: number, anchorCluster: number): Edge => {
    const pixels: Vec2[] = [];
    const pathSet = new Set<number>([startPort]);
    let prev = -1;
    let cur = startPort;
    let endCluster = -1;
    let closed = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      consumed.add(cur);
      pixels.push(pxOf(cur));
      const cx = cur % width;
      const cy = (cur / width) | 0;

      const candidates: number[] = [];
      for (const [dx, dy] of NB) {
        const nx = cx + dx;
        const ny = cy + dy;
        const ni = idx(nx, ny);
        if (at(nx, ny) === 1 && ni !== prev && !pathSet.has(ni)) candidates.push(ni);
      }

      if (candidates.length === 0) {
        const fp = pxOf(startPort);
        if (pixels.length > 4 && Math.abs(cx - fp.x) <= 1 && Math.abs(cy - fp.y) <= 1) {
          closed = true;
          endCluster = anchorCluster;
          pixels.push(pxOf(startPort));
        } else {
          const c = clusterId[cur];
          endCluster = c !== -1 ? c : -1;
        }
        break;
      }

      let best = candidates[0];
      if (prev !== -1 && candidates.length > 1) {
        const p = pxOf(prev);
        const c = pxOf(cur);
        const inx = c.x - p.x;
        const iny = c.y - p.y;
        let bestDot = -Infinity;
        for (const cand of candidates) {
          const q = pxOf(cand);
          const dot = inx * (q.x - c.x) + iny * (q.y - c.y);
          if (dot > bestDot) {
            bestDot = dot;
            best = cand;
          }
        }
      }
      prev = cur;
      cur = best;
      pathSet.add(cur);

      if (clusterId[cur] !== -1 && clusters[clusterId[cur]].isTip) {
        consumed.add(cur);
        pixels.push(pxOf(cur));
        endCluster = clusterId[cur];
        break;
      }
    }
    return { cA: anchorCluster, cB: endCluster, pixels, closed };
  };

  // 2a. 每个簇的对外度2端口各发起一次行走
  for (let cid = 0; cid < clusters.length; cid++) {
    const cluster = clusters[cid];
    const ports = new Set<number>();
    for (const cp of cluster.pixels) {
      const cx = cp % width;
      const cy = (cp / width) | 0;
      for (const [dx, dy] of NB) {
        const nx = cx + dx;
        const ny = cy + dy;
        const ni = idx(nx, ny);
        if (at(nx, ny) === 1 && clusterId[ni] === -1 && !consumed.has(ni)) ports.add(ni);
      }
    }
    for (const port of ports) {
      if (consumed.has(port)) continue;
      edges.push(walkFrom(port, cid));
    }
  }

  // 2b. 无簇纯环（全部像素度均为2）
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i] !== 1 || consumed.has(i)) continue;
    const pixels: Vec2[] = [pxOf(i)];
    consumed.add(i);
    let prev = -1;
    let cur = i;
    let closed = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const cx = cur % width;
      const cy = (cur / width) | 0;
      let nxt = -1;
      for (const [dx, dy] of NB) {
        const ni = idx(cx + dx, cy + dy);
        if (at(cx + dx, cy + dy) === 1 && ni !== prev && !consumed.has(ni)) {
          nxt = ni;
          break;
        }
      }
      if (nxt === -1) break;
      consumed.add(nxt);
      pixels.push(pxOf(nxt));
      prev = cur;
      cur = nxt;
      if (cur === i) {
        closed = true;
        break;
      }
    }
    if (pixels.length >= minRunPx) edges.push({ cA: -1, cB: -1, pixels, closed });
  }

  // 3. 短枝迭代修剪
  const alive = edges.map(() => true);
  const edgeLen = (e: Edge) => {
    let t = 0;
    for (let i = 1; i < e.pixels.length; i++) {
      t += Math.hypot(e.pixels[i].x - e.pixels[i - 1].x, e.pixels[i].y - e.pixels[i - 1].y);
    }
    return t;
  };
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clusterDegree = new Map<number, number>();
    edges.forEach((e, k) => {
      if (!alive[k] || e.closed) return;
      if (e.cA >= 0) clusterDegree.set(e.cA, (clusterDegree.get(e.cA) ?? 0) + 1);
      if (e.cB >= 0) clusterDegree.set(e.cB, (clusterDegree.get(e.cB) ?? 0) + 1);
    });
    let removed = false;
    edges.forEach((e, k) => {
      if (!alive[k] || e.closed) return;
      const tipA = e.cA >= 0 && clusters[e.cA]?.isTip && (clusterDegree.get(e.cA) ?? 0) <= 1;
      const tipB = e.cB >= 0 && clusters[e.cB]?.isTip && (clusterDegree.get(e.cB) ?? 0) <= 1;
      if ((tipA || tipB) && edgeLen(e) < spurPrunePx) {
        alive[k] = false;
        removed = true;
      }
    });
    if (!removed) break;
  }
  const live = edges.filter((_, k) => alive[k]);

  // 4. 每个簇的端口配对（最直通）
  interface Port {
    edge: number;
    side: 'A' | 'B';
    dir: Vec2;
  }
  const portsByCluster = new Map<number, Port[]>();
  live.forEach((e, k) => {
    const addPort = (cid: number, side: 'A' | 'B') => {
      if (cid < 0) return;
      const anchor = pxOf(clusters[cid].pixels[0]);
      const tip = side === 'A' ? e.pixels[0] : e.pixels[e.pixels.length - 1];
      const v = { x: tip.x - anchor.x, y: tip.y - anchor.y };
      const l = Math.hypot(v.x, v.y) || 1;
      const port: Port = { edge: k, side, dir: { x: v.x / l, y: v.y / l } };
      const arr = portsByCluster.get(cid);
      if (arr) arr.push(port);
      else portsByCluster.set(cid, [port]);
    };
    addPort(e.cA, 'A');
    addPort(e.cB, 'B');
  });

  const pair = new Map<string, Port>();
  for (const ports of portsByCluster.values()) {
    const remaining = new Set(ports);
    while (remaining.size >= 2) {
      const arr = [...remaining];
      let best: { a: Port; b: Port; dot: number } | null = null;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const dot = arr[i].dir.x * arr[j].dir.x + arr[i].dir.y * arr[j].dir.y;
          if (!best || dot < best.dot) best = { a: arr[i], b: arr[j], dot };
        }
      }
      if (!best) break;
      pair.set(`${best.a.edge}:${best.a.side}`, best.b);
      pair.set(`${best.b.edge}:${best.b.side}`, best.a);
      remaining.delete(best.a);
      remaining.delete(best.b);
    }
  }

  // 5. 拼接链
  const used = new Array<boolean>(live.length).fill(false);
  const chains: PixelRun[] = [];
  const oriented = (e: Edge, enterSide: 'A' | 'B'): Vec2[] =>
    enterSide === 'A' ? e.pixels : [...e.pixels].reverse();

  for (let k = 0; k < live.length; k++) {
    if (used[k]) continue;
    const e0 = live[k];
    if (e0.closed) {
      used[k] = true;
      chains.push({ points: e0.pixels, closed: true });
      continue;
    }
    let enterSide: 'A' | 'B' = 'A';
    if (!pair.has(`${k}:A`)) enterSide = 'A';
    else if (!pair.has(`${k}:B`)) enterSide = 'B';

    const chain: Vec2[] = [];
    let cur = k;
    let side = enterSide;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      used[cur] = true;
      const part = oriented(live[cur], side);
      if (chain.length === 0) chain.push(...part);
      else chain.push(...part.slice(1));
      const exitSide: 'A' | 'B' = side === 'A' ? 'B' : 'A';
      const nxt = pair.get(`${cur}:${exitSide}`);
      if (!nxt || used[nxt.edge]) break;
      cur = nxt.edge;
      side = nxt.side;
    }
    chains.push({ points: chain, closed: false });
  }

  // 6. RDP 抽稀 + 长度过滤
  const out: PixelRun[] = [];
  for (const c of chains) {
    const simple = rdp(c.points, 0.9);
    let len = 0;
    for (let i = 1; i < simple.length; i++) {
      len += Math.hypot(simple[i].x - simple[i - 1].x, simple[i].y - simple[i - 1].y);
    }
    if (len < minRunPx) continue;
    out.push({ points: simple, closed: c.closed });
  }
  return out;
}
