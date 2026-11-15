import type { Vec2 } from '../types';
import { rdp } from '../lib/geometry';

export interface ContourLoop {
  points: Vec2[];
  closed: true;
}

/** Moore 邻接（顺时针顺序），索引方向 */
const MOORE: Array<[number, number]> = [
  [0, -1], // 0 上
  [1, -1], // 1 右上
  [1, 0], // 2 右
  [1, 1], // 3 右下
  [0, 1], // 4 下
  [-1, 1], // 5 左下
  [-1, 0], // 6 左
  [-1, -1], // 7 左上
];

/**
 * 从二值掩码的边界像素追踪闭合轮廓（Moore-Neighbor Tracing）。
 * 每个 8 连通前景域输出一条有序闭合折线。
 */
export function traceContours(
  mask: Uint8Array,
  width: number,
  height: number,
  rdpEpsilon = 1.2,
): ContourLoop[] {
  const idx = (x: number, y: number) => y * width + x;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[idx(x, y)];

  // 边界像素集合
  const isBoundary = (x: number, y: number): boolean => {
    if (at(x, y) !== 1) return false;
    return (
      at(x, y - 1) === 0 || at(x + 1, y) === 0 || at(x, y + 1) === 0 || at(x - 1, y) === 0
    );
  };

  const visited = new Set<number>();
  const loops: ContourLoop[] = [];
  const claimedStart = new Set<number>();

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      if (!isBoundary(sx, sy) || claimedStart.has(idx(sx, sy))) continue;
      // 该起点已属于之前追踪出的某条环
      if (visited.has(idx(sx, sy))) continue;

      // Moore 追踪（visited 仅记录本环路径，避免不同连通域互相干扰）
      const path: Vec2[] = [{ x: sx, y: sy }];
      const localVisited = new Set<number>([idx(sx, sy)]);
      let cx = sx;
      let cy = sy;
      let backDir = 0;
      let guard = 0;
      const maxSteps = width * height;

      // eslint-disable-next-line no-constant-condition
      while (guard++ < maxSteps) {
        // 从 backDir 的下一个方向开始顺时针扫描
        let found = false;
        let nextX = cx;
        let nextY = cy;
        let chosenDir = backDir;
        for (let k = 1; k <= 8; k++) {
          const dir = (backDir + k) % 8;
          const [dx, dy] = MOORE[dir];
          const nx = cx + dx;
          const ny = cy + dy;
          if (at(nx, ny) === 1) {
            found = true;
            nextX = nx;
            nextY = ny;
            // 新的 backtrack = 来向的反方向
            chosenDir = (dir + 4) % 8;
            break;
          }
        }
        if (!found) break;

        const ni = idx(nextX, nextY);
        if (nextX === sx && nextY === sy) {
          path.push({ x: sx, y: sy });
          break;
        }
        if (localVisited.has(ni)) {
          path.push({ x: nextX, y: nextY });
          break;
        }
        localVisited.add(ni);
        path.push({ x: nextX, y: nextY });
        cx = nextX;
        cy = nextY;
        backDir = chosenDir;
      }

      // 本环像素登记为全局已访问，起点单独标记避免重复发起
      localVisited.forEach((p) => visited.add(p));
      claimedStart.add(idx(sx, sy));

      if (path.length >= 6) {
        const simplified = rdp(path.slice(0, -1), rdpEpsilon);
        if (simplified.length >= 4) {
          loops.push({ points: [...simplified, simplified[0]], closed: true });
        }
      }
    }
  }
  return loops;
}
