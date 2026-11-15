import * as THREE from 'three';
import type { BoardConfig, TubeRun } from '../types';
import { colorById } from '../constants';

/**
 * 在背板正面生成光溢出贴图：每段灯管沿路径多次叠加径向渐变，
 * 模拟霓虹在背板上的漫反射晕染。结果缓存为 CanvasTexture。
 */
export function createSpillTexture(runs: TubeRun[], board: BoardConfig): THREE.CanvasTexture {
  const maxPx = 1024;
  const scale = Math.min(maxPx / board.widthMm, maxPx / board.heightMm);
  const w = Math.max(64, Math.round(board.widthMm * scale));
  const h = Math.max(64, Math.round(board.heightMm * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  const toPx = (mmX: number, mmY: number): [number, number] => [
    (mmX + board.widthMm / 2) * scale,
    (board.heightMm / 2 - mmY) * scale,
  ];

  for (const run of runs) {
    const preset = colorById(run.colorId);
    // 晕染半径取管径的适度倍数，过大会糊成色块
    const glowRadius = Math.max(18, run.diameterMm * 4.5) * scale;
    const stepMm = 6 / scale;
    for (let i = 0; i < run.points.length - 1; i++) {
      const a = run.points[i];
      const b = run.points[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const parts = Math.max(1, Math.ceil(segLen / stepMm));
      for (let k = 0; k <= parts; k++) {
        const t = k / parts;
        const [px, py] = toPx(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        const grad = ctx.createRadialGradient(px, py, 0, px, py, glowRadius);
        grad.addColorStop(0, hexWithAlpha(preset.glow, 0.05));
        grad.addColorStop(0.4, hexWithAlpha(preset.glow, 0.02));
        grad.addColorStop(1, hexWithAlpha(preset.glow, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}

/** 墙面反光：把溢出贴图模糊放大后贴到墙上 */
export function createWallGlowTexture(runs: TubeRun[], board: BoardConfig): THREE.CanvasTexture {
  const base = createSpillTexture(runs, { ...board, widthMm: board.widthMm * 1.5, heightMm: board.heightMm * 1.5 });
  const src = base.image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.filter = 'blur(26px)';
  ctx.drawImage(src, 0, 0, 512, 512);
  ctx.filter = 'none';
  base.dispose();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
