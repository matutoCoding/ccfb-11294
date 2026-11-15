import type { DesignSource, SvgSource, TextSource, Vec2 } from '../types';

export interface RasterMask {
  mask: Uint8Array; // 1=笔画
  width: number;
  height: number;
  /** 内容包围盒（像素） */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export const MAX_RASTER_PX = 1500;

function measureMask(ctx: CanvasRenderingContext2D, w: number, h: number): RasterMask {
  const img = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const r = img[i * 4];
      const g = img[i * 4 + 1];
      const b = img[i * 4 + 2];
      const a = img[i * 4 + 3];
      // 笔画 = 不透明且偏暗（白底深字）。按感知亮度判定，兼容任意深色填充。
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (a > 128 && luminance < 160) {
        mask[i] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { mask, width: w, height: h, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  return { mask, width: w, height: h, bounds: { minX, minY, maxX, maxY } };
}

export async function rasterizeText(src: TextSource, maxMmW: number, maxMmH: number): Promise<RasterMask> {
  const chars = Array.from(src.text);
  if (chars.length === 0) throw new Error('文字内容为空');

  // 像素/毫米 比例：让字体物理尺寸为 fontSizeMm，同时限制画布不超过 MAX_RASTER_PX
  const pxPerMm = Math.min(
    MAX_RASTER_PX / Math.max(maxMmW, maxMmH),
    3,
  );
  const fontPx = Math.max(12, Math.round(src.fontSizeMm * pxPerMm));
  const spacingPx = Math.round(src.letterSpacingMm * pxPerMm);
  const font = `${src.bold ? '700' : '400'} ${fontPx}px "${src.fontFamily}", "Microsoft YaHei", sans-serif`;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;
  mctx.font = font;
  const advance = chars.map((ch) => mctx.measureText(ch).width);
  const textW = advance.reduce((a, b) => a + b, 0) + spacingPx * (chars.length - 1);
  const textH = fontPx * 1.35;

  const pad = Math.ceil(fontPx * 0.12) + 4;
  const w = Math.ceil(textW + pad * 2);
  const h = Math.ceil(textH + pad * 2);
  if (w > MAX_RASTER_PX || h > MAX_RASTER_PX) {
    throw new Error(`内容栅格化尺寸 ${w}×${h}px 超出上限，请缩小字号或背板尺寸`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000'; // 深色字 + 白底，measureMask 按亮度提取笔画
  ctx.font = font;
  ctx.textBaseline = 'middle';

  // 等待字体就绪（含用户上传的 TTF）
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.load(font);
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* 忽略，退回系统字体 */
  }
  ctx.font = font;

  let cursor = pad;
  const baseline = h / 2;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cursor, baseline);
    cursor += advance[i] + spacingPx;
  });
  return measureMask(ctx, w, h);
}

export async function rasterizeSvg(src: SvgSource, maxMmW: number, maxMmH: number): Promise<RasterMask> {
  const blob = new Blob([src.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 解析失败，请检查文件格式'));
      img.src = url;
    });
    const natW = img.naturalWidth || 300;
    const natH = img.naturalHeight || 150;

    // 直接把 SVG 绘制到对应物理可用区域的像素画布：
    // 可用毫米按 3px/mm（与文字一致）换算成像素上限，再等比缩放 SVG
    const maxPxW = Math.round(maxMmW * 3);
    const maxPxH = Math.round(maxMmH * 3);
    const scale = Math.min(maxPxW / natW, maxPxH / natH, MAX_RASTER_PX / Math.max(natW, natH));
    const w = Math.max(8, Math.round(natW * scale));
    const h = Math.max(8, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.drawImage(img, 0, 0, w, h);
    return measureMask(ctx, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function rasterize(source: DesignSource, maxMmW: number, maxMmH: number): Promise<RasterMask> {
  return source.type === 'text'
    ? rasterizeText(source, maxMmW, maxMmH)
    : rasterizeSvg(source, maxMmW, maxMmH);
}

/**
 * 像素坐标（y 向下）转背板毫米坐标（中心原点，y 向上）。
 * 以内容包围盒等比缩放到目标物理尺寸并居中。
 */
export function pixelRunsToMm(
  runs: Array<{ points: Vec2[]; closed: boolean }>,
  raster: RasterMask,
  targetMmW: number,
  targetMmH: number,
): Array<{ points: Vec2[]; closed: boolean }> {
  const bw = Math.max(1, raster.bounds.maxX - raster.bounds.minX + 1);
  const bh = Math.max(1, raster.bounds.maxY - raster.bounds.minY + 1);
  const scale = Math.min(targetMmW / bw, targetMmH / bh);
  const contentW = bw * scale;
  const contentH = bh * scale;
  const offX = -contentW / 2;
  const offY = contentH / 2;

  return runs.map((run) => ({
    closed: run.closed,
    points: run.points.map((p) => ({
      x: offX + (p.x - raster.bounds.minX) * scale,
      y: offY - (p.y - raster.bounds.minY) * scale,
    })),
  }));
}
