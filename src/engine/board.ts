import * as THREE from 'three';
import type { BoardConfig, BoardMaterialKind } from '../types';

/** 程序化木纹贴图（无需外部资源） */
function createWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#5a3d28');
  grad.addColorStop(0.5, '#6e4d33');
  grad.addColorStop(1, '#523722');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 512;
    ctx.strokeStyle = `rgba(40,24,12,${0.08 + Math.random() * 0.18})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * (3 + Math.random() * 4));
    }
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 12 + Math.random() * 22;
    const rg = ctx.createRadialGradient(x, y, 2, x, y, r);
    rg.addColorStop(0, 'rgba(35,20,10,0.5)');
    rg.addColorStop(1, 'rgba(35,20,10,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBrushedMetalTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8d9299';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) {
    const v = 130 + Math.round(Math.random() * 40);
    ctx.strokeStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const materialDefs: Record<BoardMaterialKind, { roughness: number; metalness: number }> = {
  acrylic: { roughness: 0.22, metalness: 0 },
  metal: { roughness: 0.38, metalness: 0.85 },
  wood: { roughness: 0.72, metalness: 0 },
};

export interface BoardMeshes {
  group: THREE.Group;
  faceMaterial: THREE.MeshStandardMaterial;
  widthMm: number;
  heightMm: number;
}

export function createBoard(config: BoardConfig): BoardMeshes {
  const group = new THREE.Group();
  const w = config.widthMm;
  const h = config.heightMm;
  const t = config.thicknessMm;
  const def = materialDefs[config.material];

  const faceMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.color),
    roughness: def.roughness,
    metalness: def.metalness,
  });
  if (config.material === 'wood') {
    const tex = createWoodTexture();
    tex.repeat.set(Math.max(1, w / 400), Math.max(1, h / 400));
    faceMaterial.map = tex;
    faceMaterial.color = new THREE.Color('#ffffff');
  } else if (config.material === 'metal') {
    const tex = createBrushedMetalTexture();
    tex.repeat.set(Math.max(1, w / 300), Math.max(1, h / 300));
    faceMaterial.map = tex;
    faceMaterial.color = new THREE.Color(config.color).lerp(new THREE.Color('#ffffff'), 0.35);
  }

  // 背板正面位于 z=0，管体在 z>0
  const boardGeo = new THREE.BoxGeometry(w, h, t);
  const board = new THREE.Mesh(boardGeo, faceMaterial);
  board.position.z = -t / 2;
  group.add(board);

  // 亚克力边缘高光
  if (config.material === 'acrylic') {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boardGeo),
      new THREE.LineBasicMaterial({ color: 0x3a4250, transparent: true, opacity: 0.6 }),
    );
    edges.position.z = -t / 2;
    group.add(edges);
  }

  return { group, faceMaterial, widthMm: w, heightMm: h };
}

export function createWall(config: BoardConfig): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial } {
  const span = Math.max(config.widthMm, config.heightMm) * 2.6;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.wallColor),
    roughness: 0.92,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, span), material);
  mesh.position.z = -config.thicknessMm - config.wallDistanceMm;
  return { mesh, material };
}
