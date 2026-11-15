/**
 * 形态学轮廓提取：前景中至少有一个 4 邻接背景像素的像素 = 外边界。
 * 对填充图形（logo/实心字）沿边界走管，避免中轴树的内部分支。
 */
export function extractContour(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x];
  const N4: Array<[number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] !== 1) continue;
      let boundary = false;
      for (const [dx, dy] of N4) {
        if (at(x + dx, y + dy) === 0) {
          boundary = true;
          break;
        }
      }
      if (boundary) out[i] = 1;
    }
  }
  return out;
}

/**
 * Zhang-Suen 二值图像细化算法，输出单像素骨架。
 * 输入 mask: Uint8Array，1=前景（笔画），0=背景，逐行存储。
 * 输出同尺寸 Uint8Array，骨架点为 1。
 */
export function zhangSuenThin(mask: Uint8Array, width: number, height: number): Uint8Array {
  const img = mask.slice();
  const changedFlag = { value: true };

  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return img[y * width + x];
  };

  function step(evenIter: boolean): boolean {
    const toDelete: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (img[idx] !== 1) continue;

        const p2 = at(x, y - 1);
        const p3 = at(x + 1, y - 1);
        const p4 = at(x + 1, y);
        const p5 = at(x + 1, y + 1);
        const p6 = at(x, y + 1);
        const p7 = at(x - 1, y + 1);
        const p8 = at(x - 1, y);
        const p9 = at(x - 1, y - 1);
        const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];

        const sum = neighbors.reduce((a, b) => a + b, 0);
        if (sum < 2 || sum > 6) continue;

        // 0->1 转换次数
        let transitions = 0;
        for (let k = 0; k < 8; k++) {
          if (neighbors[k] === 0 && neighbors[(k + 1) % 8] === 1) transitions++;
        }
        if (transitions !== 1) continue;

        if (evenIter) {
          if (p2 * p4 * p6 !== 0) continue;
          if (p4 * p6 * p8 !== 0) continue;
        } else {
          if (p2 * p4 * p8 !== 0) continue;
          if (p2 * p6 * p8 !== 0) continue;
        }
        toDelete.push(idx);
      }
    }
    for (const idx of toDelete) img[idx] = 0;
    return toDelete.length > 0;
  }

  let guard = 0;
  while (changedFlag.value && guard < 200) {
    const c1 = step(true);
    const c2 = step(false);
    changedFlag.value = c1 || c2;
    guard++;
  }
  return img;
}

/** 连通域分析：返回每个前景像素的连通域 id（-1 为背景），按 8 邻接 */
export function labelComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): { labels: Int32Array; count: number } {
  const labels = new Int32Array(width * height).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1 || labels[i] !== -1) continue;
    const id = next++;
    labels[i] = id;
    stack.push(i);
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (mask[nIdx] === 1 && labels[nIdx] === -1) {
            labels[nIdx] = id;
            stack.push(nIdx);
          }
        }
      }
    }
  }
  return { labels, count: next };
}
