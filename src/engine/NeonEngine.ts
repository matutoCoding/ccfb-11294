import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { AnimationConfig, BoardConfig, Order, TubeRun } from '../types';
import { createBoard, createWall } from './board';
import { createSpillTexture, createWallGlowTexture } from './spill';
import { createTubeObject, type TubeObject } from './tube';

export type EngineMode = 'layout' | 'night';

export interface EngineOptions {
  bloomStrength: number;
  quality: 'auto' | 'low' | 'high';
}

const MODE_MAP = { steady: 0, flicker: 1, chase: 2, broken: 3 } as const;

export class NeonEngine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Clock();
  private raf = 0;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  private boardGroup: THREE.Group | null = null;
  private wallMesh: THREE.Mesh | null = null;
  private spillMesh: THREE.Mesh | null = null;
  private wallGlowMesh: THREE.Mesh | null = null;
  private tubeGroup = new THREE.Group();
  private tubeObjects = new Map<string, TubeObject>();
  private ambient: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;

  private mode: EngineMode = 'night';
  private animation: AnimationConfig | null = null;
  private simTime = 0;
  private disposed = false;
  private quality: 'low' | 'high';
  private qualitySetting: 'auto' | 'low' | 'high';
  private fpsSamples: number[] = [];
  private lastFpsTick = performance.now();
  private frames = 0;
  private autoDowngraded = false;
  onFps?: (fps: number) => void;

  constructor(container: HTMLElement, options: EngineOptions) {
    this.container = container;
    this.qualitySetting = options.quality;
    this.quality = options.quality === 'low' ? 'low' : 'high';

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.quality === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#0a0b0e');
    this.camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / Math.max(1, container.clientHeight),
      5,
      20000,
    );
    this.camera.position.set(0, -60, 900);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 6000;
    this.controls.maxPolarAngle = Math.PI * 0.92;

    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this.keyLight.position.set(300, -400, 800);
    this.scene.add(this.ambient, this.keyLight, this.tubeGroup);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      options.bloomStrength,
      0.5,
      0.6,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.loop();
  }

  private pixelRatio(): number {
    const cap = this.quality === 'high' ? 2 : 1.25;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  setMode(mode: EngineMode): void {
    this.mode = mode;
    const night = mode === 'night';
    this.scene.background = new THREE.Color(night ? '#07080b' : '#1a1e26');
    this.ambient.intensity = night ? 0.16 : 0.7;
    this.keyLight.intensity = night ? 0.25 : 1.2;
    this.bloom.strength = night ? this.bloom.strength : 0;
    if (this.wallMesh) this.wallMesh.visible = night;
    if (this.wallGlowMesh) this.wallGlowMesh.visible = night;
    if (this.spillMesh) this.spillMesh.visible = night;
  }

  setBloomStrength(value: number): void {
    if (this.mode === 'night') this.bloom.strength = value;
  }

  setQuality(quality: 'auto' | 'low' | 'high'): void {
    this.qualitySetting = quality;
    const target = quality === 'low' ? 'low' : 'high';
    if (target !== this.quality || quality === 'auto') {
      this.quality = target;
      this.autoDowngraded = false;
      this.applyQuality();
    }
  }

  private applyQuality(): void {
    this.renderer.setPixelRatio(this.pixelRatio());
    this.handleResize();
  }

  loadOrder(order: Order): void {
    this.lastBoard = order.board;
    this.rebuildBoard(order.board);
    this.rebuildTubes(order.runs);
    this.refreshSpill(order.board);
    this.animation = { ...order.animation };
    this.frameCameraToBoard(order.board);
  }

  updateRuns(runs: TubeRun[]): void {
    this.rebuildTubes(runs);
    if (this.lastBoard) this.refreshSpill(this.lastBoard);
  }

  updateBoard(board: BoardConfig): void {
    this.lastBoard = board;
    this.rebuildBoard(board);
    this.refreshSpill(board);
  }

  setAnimation(anim: AnimationConfig): void {
    this.animation = { ...anim };
    this.tubeObjects.forEach((obj) => {
      const u = obj.coreMaterial.uniforms;
      u.uMode.value = MODE_MAP[anim.mode];
      u.uSpeed.value = anim.speed;
      u.uFlickerHz.value = anim.flickerHz;
      u.uChasePeriod.value = anim.chaseCycleSec;
      u.uIntensity.value = anim.intensity;
    });
  }

  setRunBroken(runId: string, startT: number, endT: number): void {
    const obj = this.tubeObjects.get(runId);
    if (!obj) return;
    obj.coreMaterial.uniforms.uBrokenStart.value = startT;
    obj.coreMaterial.uniforms.uBrokenEnd.value = endT;
  }

  setRunHighlight(runId: string | null): void {
    this.tubeObjects.forEach((obj, id) => {
      obj.group.scale.setScalar(id === runId ? 1.06 : 1);
    });
  }

  private rebuildBoard(board: BoardConfig): void {
    if (this.boardGroup) {
      this.scene.remove(this.boardGroup);
      this.disposeGroup(this.boardGroup);
    }
    const built = createBoard(board);
    this.boardGroup = built.group;
    this.scene.add(this.boardGroup);

    // 墙面（反光贴图在 refreshSpill 中创建/刷新）
    if (this.wallMesh) {
      this.scene.remove(this.wallMesh);
      this.disposeGroup(this.wallMesh);
    }
    const wall = createWall(board);
    this.wallMesh = wall.mesh;
    this.wallMesh.visible = this.mode === 'night';
    this.scene.add(this.wallMesh);

    if (!this.spillMesh) {
      const spillMat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.55,
      });
      this.spillMesh = new THREE.Mesh(new THREE.PlaneGeometry(board.widthMm, board.heightMm), spillMat);
      this.spillMesh.position.z = 0.6;
      this.spillMesh.visible = this.mode === 'night';
      this.scene.add(this.spillMesh);
    } else {
      this.spillMesh.geometry.dispose();
      this.spillMesh.geometry = new THREE.PlaneGeometry(board.widthMm, board.heightMm);
    }

    if (!this.wallGlowMesh) {
      const glowMat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.4,
      });
      this.wallGlowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(board.widthMm * 1.6, board.heightMm * 1.6),
        glowMat,
      );
      this.wallGlowMesh.visible = this.mode === 'night';
      this.scene.add(this.wallGlowMesh);
    } else {
      this.wallGlowMesh.geometry.dispose();
      this.wallGlowMesh.geometry = new THREE.PlaneGeometry(board.widthMm * 1.6, board.heightMm * 1.6);
    }
    this.wallGlowMesh.position.z = -board.thicknessMm - board.wallDistanceMm + 2;
  }

  private currentRuns: TubeRun[] = [];

  private rebuildTubes(runs: TubeRun[]): void {
    this.currentRuns = runs;
    this.tubeGroup.clear();
    this.tubeObjects.forEach((obj) => obj.dispose());
    this.tubeObjects.clear();
    for (const run of runs) {
      const obj = createTubeObject(run);
      if (this.animation) {
        const u = obj.coreMaterial.uniforms;
        u.uMode.value = MODE_MAP[this.animation.mode];
        u.uSpeed.value = this.animation.speed;
        u.uFlickerHz.value = this.animation.flickerHz;
        u.uChasePeriod.value = this.animation.chaseCycleSec;
        u.uIntensity.value = this.animation.intensity;
        if (run.broken) {
          u.uBrokenStart.value = run.broken.startT;
          u.uBrokenEnd.value = run.broken.endT;
        }
      }
      this.tubeObjects.set(run.id, obj);
      this.tubeGroup.add(obj.group);
    }
  }

  private lastBoard: BoardConfig | null = null;

  private refreshSpill(board: BoardConfig): void {
    if (this.spillMesh) {
      const old = (this.spillMesh.material as THREE.MeshBasicMaterial).map;
      const tex = createSpillTexture(this.currentRuns, board);
      (this.spillMesh.material as THREE.MeshBasicMaterial).map = tex;
      (this.spillMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
      old?.dispose();
    }
    if (this.wallGlowMesh) {
      const old = (this.wallGlowMesh.material as THREE.MeshBasicMaterial).map;
      const tex = createWallGlowTexture(this.currentRuns, board);
      (this.wallGlowMesh.material as THREE.MeshBasicMaterial).map = tex;
      (this.wallGlowMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
      old?.dispose();
    }
  }

  private frameCameraToBoard(board: BoardConfig): void {
    this.lastBoard = board;
    const dist = Math.max(board.widthMm, board.heightMm) * 1.35;
    this.camera.position.set(0, -board.heightMm * 0.12, dist);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private handleResize(): void {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.simTime += dt;

    this.tubeObjects.forEach((obj) => {
      obj.coreMaterial.uniforms.uTime.value = this.simTime;
    });
    this.controls.update();
    this.composer.render();

    // FPS 统计（1 秒窗口）
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsTick >= 1000) {
      const fps = (this.frames * 1000) / (now - this.lastFpsTick);
      this.fpsSamples.push(fps);
      if (this.fpsSamples.length > 5) this.fpsSamples.shift();
      this.onFps?.(fps);
      this.frames = 0;
      this.lastFpsTick = now;
      this.maybeAutoDowngrade();
    }
  };

  private maybeAutoDowngrade(): void {
    if (this.qualitySetting !== 'auto' || this.autoDowngraded || this.quality === 'low') return;
    if (this.fpsSamples.length < 3) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    if (avg < 50) {
      this.autoDowngraded = true;
      this.quality = 'low';
      this.applyQuality();
    }
  }

  /** 截取当前画面（含辉光），返回 dataURL */
  capture(): string {
    this.composer.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  resetView(): void {
    if (this.lastBoard) this.frameCameraToBoard(this.lastBoard);
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  private disposeGroup(group: THREE.Object3D): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.tubeObjects.forEach((obj) => obj.dispose());
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
