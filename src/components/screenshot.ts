import type { BoardConfig, TubeRun } from '../types';
import { colorById } from '../constants';
import { downloadBlob, safeFileName } from '../lib/util';

/**
 * 在 WebGL 截图上叠加工程标注：背板尺寸、安全边距、每段灯管颜色与长度、
 * 弯管半径参数，输出 PNG。
 */
export function exportAnnotatedShot(
  dataUrl: string,
  runs: TubeRun[],
  board: BoardConfig,
  bendRadiusMm: number,
  orderName: string,
): void {
  const img = new Image();
  img.onload = () => {
    const W = img.width;
    const H = img.height + 190;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0c0e13';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);

    // 画面内尺寸标注
    ctx.strokeStyle = 'rgba(56,189,248,0.9)';
    ctx.fillStyle = '#9fdcff';
    ctx.lineWidth = Math.max(1.5, W / 900);
    ctx.font = `${Math.max(12, W / 64)}px sans-serif`;
    const margin = W * 0.06;
    const y = img.height - margin * 0.55;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(W - margin, y);
    ctx.moveTo(margin, y - 8);
    ctx.lineTo(margin, y + 8);
    ctx.moveTo(W - margin, y - 8);
    ctx.lineTo(W - margin, y + 8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`${board.widthMm} mm`, W / 2, y - 8);

    // 信息栏
    const infoY = img.height + 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${orderName} · 霓虹效果截图`, 24, infoY + 14);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#9aa5ba';
    ctx.fillText(
      `背板 ${board.widthMm}×${board.heightMm}×${board.thicknessMm}mm · 弯管最小半径 ${bendRadiusMm}mm · ${runs.length} 段灯管`,
      24,
      infoY + 40,
    );

    const total = runs.reduce((a, r) => a + r.lengthMm, 0);
    ctx.fillText(`灯管总长 ${(total / 1000).toFixed(2)} m`, 24, infoY + 62);

    // 颜色参数图例
    const grouped = new Map<string, { count: number; len: number }>();
    runs.forEach((r) => {
      const g = grouped.get(r.colorId) ?? { count: 0, len: 0 };
      g.count++;
      g.len += r.lengthMm;
      grouped.set(r.colorId, g);
    });
    let lx = 24;
    let ly = infoY + 96;
    ctx.font = '13px sans-serif';
    grouped.forEach((g, id) => {
      const preset = colorById(id);
      ctx.fillStyle = preset.core;
      ctx.shadowColor = preset.glow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(lx + 8, ly - 4, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#c8d0e0';
      const text = `${preset.name} ${preset.core} · ${g.count}段 ${(g.len / 1000).toFixed(2)}m`;
      ctx.fillText(text, lx + 22, ly);
      lx += ctx.measureText(text).width + 60;
      if (lx > W - 220) {
        lx = 24;
        ly += 26;
      }
    });

    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${safeFileName(orderName)}-neon-render.png`);
    }, 'image/png');
  };
  img.src = dataUrl;
}
