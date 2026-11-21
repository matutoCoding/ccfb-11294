import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { AppSettings, BoardSpec, NeonStroke, Order } from '../types'
import { PolylineCurve3 } from '../lib/polylineCurve'
import { glslIntensity, intensityAt, MODE_INDEX } from './intensity'

interface StrokeRuntime {
  stroke: NeonStroke
  group: THREE.Group
  core: THREE.Mesh
  glowMat: THREE.ShaderMaterial
  halo: THREE.Points
  light: THREE.PointLight | null
  lightU: number
}

/** 程序生成柔光精灵贴图（径向渐变） */
function makeHaloTexture(): THREE.Texture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeWoodTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#6b4a2f'
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 90; i++) {
    const y = (i * 512) / 90 + Math.sin(i * 1.7) * 6
    const shade = 30 + 40 * Math.abs(Math.sin(i * 0.9))
    ctx.strokeStyle = `rgba(${shade + 60},${shade + 30},${shade},0.35)`
    ctx.lineWidth = 1 + (i % 3)
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin((x + i * 20) * 0.02) * 5)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeBrushedMetalTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#9aa0a6'
  ctx.fillRect(0, 0, 512, 512)
  for (let y = 0; y < 512; y += 2) {
    const v = 140 + Math.floor(20 * Math.sin(y * 0.3))
    ctx.fillStyle = `rgba(${v},${v},${v + 6},0.5)`
    ctx.fillRect(0, y, 512, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class NeonEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private composer: EffectComposer
  private bloom: UnrealBloomPass
  private clock = new THREE.Clock()
  private raf = 0
  private container: HTMLElement
  private haloTex = makeHaloTexture()
  private woodTex = makeWoodTexture()
  private metalTex = makeBrushedMetalTexture()

  private boardMesh: THREE.Mesh | null = null
  private wall!: THREE.Mesh
  private floor!: THREE.Mesh
  private strokeGroup = new THREE.Group()
  private runtimes: StrokeRuntime[] = []
  private order: Order | null = null
  private settings: AppSettings
  private fps = 60
  private frameCount = 0
  private fpsTimer = 0
  private ro: ResizeObserver

  constructor(container: HTMLElement, settings: AppSettings) {
    this.container = container
    this.settings = settings

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'

    const w = container.clientWidth || 800
    const h = container.clientHeight || 600
    this.camera = new THREE.PerspectiveCamera(45, w / h, 10, 20000)
    this.camera.position.set(700, 350, 1100)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 200
    this.controls.maxDistance = 8000
    this.controls.maxPolarAngle = Math.PI * 0.92

    this.scene.add(this.strokeGroup)
    this.buildEnvironment()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), settings.bloomStrength, settings.bloomRadius, 0.05)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.applyBloomResolution()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)

    this.animate = this.animate.bind(this)
    this.raf = requestAnimationFrame(this.animate)
  }

  private buildEnvironment() {
    this.scene.background = new THREE.Color('#07090d')
    this.scene.fog = new THREE.Fog('#07090d', 4000, 12000)

    const ambient = new THREE.AmbientLight('#3a4356', 0.7)
    this.scene.add(ambient)
    const hemi = new THREE.HemisphereLight('#22304a', '#0a0c10', 0.5)
    this.scene.add(hemi)

    // 墙面（背板后方）与地面
    const wallMat = new THREE.MeshStandardMaterial({ color: '#161a21', roughness: 0.92, metalness: 0 })
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5000), wallMat)
    this.scene.add(this.wall)

    const floorMat = new THREE.MeshStandardMaterial({ color: '#10131a', roughness: 0.35, metalness: 0.1 })
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), floorMat)
    this.floor.rotation.x = -Math.PI / 2
    this.floor.receiveShadow = true
    this.scene.add(this.floor)
  }

  private boardMaterial(board: BoardSpec): THREE.Material {
    const color = new THREE.Color(board.color)
    if (board.material === 'acrylic') {
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.15 + board.finish * 0.5,
        metalness: 0,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2 + board.finish * 0.4,
      })
    }
    if (board.material === 'metal') {
      return new THREE.MeshStandardMaterial({
        color,
        map: this.metalTex,
        roughness: 0.25 + board.finish * 0.6,
        metalness: 0.85,
      })
    }
    return new THREE.MeshStandardMaterial({
      color,
      map: this.woodTex,
      roughness: 0.55 + board.finish * 0.35,
      metalness: 0.05,
    })
  }

  setOrder(order: Order) {
    this.order = order
    this.rebuildBoard(order.board)
    this.rebuildStrokes(order)
    this.frameCamera(order.board)
  }

  private rebuildBoard(board: BoardSpec) {
    if (this.boardMesh) {
      this.scene.remove(this.boardMesh)
      this.boardMesh.geometry.dispose()
      ;(this.boardMesh.material as THREE.Material).dispose()
    }
    const radius = Math.min(board.cornerRadius, board.thickness * 0.45, 20)
    const geo = new RoundedBoxGeometry(board.width, board.height, board.thickness, 4, radius)
    this.boardMesh = new THREE.Mesh(geo, this.boardMaterial(board))
    this.boardMesh.castShadow = true
    this.boardMesh.receiveShadow = true
    this.scene.add(this.boardMesh)

    // 墙贴在背板后面，地面在背板下方
    this.wall.position.set(0, 0, -board.thickness / 2 - 120)
    this.floor.position.set(0, -board.height / 2 - 2, 0)
    this.controls.target.set(0, 0, board.tubeZ * 0.3)
  }

  private rebuildStrokes(order: Order) {
    this.disposeStrokes()
    const colorMap = new Map(this.settings.colorPresets.map((p) => [p.id, p]))
    const visible = order.strokes.filter((s) => s.visible && s.points.length > 1)

    visible.forEach((stroke, idx) => {
      const preset = colorMap.get(stroke.colorId)
      const glowColor = new THREE.Color(preset?.glow ?? '#ff2d3d')
      const glassColor = new THREE.Color(preset?.glass ?? '#ff8088')
      const z = order.board.tubeZ
      const curve = new PolylineCurve3(stroke.points, z, stroke.closed)
      const tubularSegments = Math.max(32, Math.floor(curve.getLength() / 6))
      const r = stroke.tubeDiameter / 2

      const group = new THREE.Group()

      // 外层玻璃管体
      const glassGeo = new THREE.TubeGeometry(curve, tubularSegments, r, 14, stroke.closed)
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: glassColor,
        transparent: true,
        opacity: 0.28,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.55,
        thickness: r * 2,
        ior: 1.45,
        clearcoat: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const glass = new THREE.Mesh(glassGeo, glassMat)
      glass.renderOrder = 2
      group.add(glass)

      // 内部发光气体管（自定义着色器驱动动画）
      const coreGeo = new THREE.TubeGeometry(curve, tubularSegments, r * 0.42, 10, stroke.closed)
      const glowMat = this.makeGlowMaterial(glowColor, stroke, order.animation)
      const core = new THREE.Mesh(coreGeo, glowMat)
      core.renderOrder = 1
      group.add(core)

      // 沿管分布的辉光精灵（墙面溢散光）
      const halo = this.makeHaloPoints(curve, glowColor, stroke, order)
      group.add(halo)

      // 限量动态点光源：只给最长的 4 根配灯
      const needLight = idx < 4
      let light: THREE.PointLight | null = null
      if (needLight) {
        light = new THREE.PointLight(glowColor, 8, 1400, 1.8)
        light.castShadow = false
        group.add(light)
      }

      this.strokeGroup.add(group)
      this.runtimes.push({ stroke, group, core, glowMat, halo, light, lightU: 0.5 })
    })
    this.updateLightBudget(visible.length)
  }

  private updateLightBudget(visibleCount: number) {
    // 按笔画长度排序，最长的 4 根持有点光源
    const sorted = [...this.runtimes].sort((a, b) => b.stroke.length - a.stroke.length)
    sorted.forEach((rt, i) => {
      if (!rt.light) return
      rt.light.visible = i < 4
    })
    if (visibleCount > 4) {
      sorted.slice(4).forEach((rt) => { if (rt.light) rt.light.visible = false })
    }
  }

  private makeGlowMaterial(color: THREE.Color, stroke: NeonStroke, anim: Order['animation']): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uTime: { value: 0 },
        uSpeed: { value: anim.speed },
        uFlickerRate: { value: anim.flickerRate },
        uChasePeriod: { value: anim.chasePeriod },
        uFaultRate: { value: anim.faultRate },
        uMode: { value: MODE_INDEX[stroke.animation] },
        uFault: { value: new THREE.Vector2(stroke.faultRange.from, stroke.faultRange.to) },
        uSelected: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime, uSpeed, uFlickerRate, uChasePeriod, uFaultRate, uSelected;
        uniform int uMode;
        uniform vec2 uFault;
        varying vec2 vUv;
        ${glslIntensity}
        void main() {
          float k = intensityAt(uMode, vUv.x, uTime, uSpeed, uFlickerRate, uChasePeriod, uFaultRate, uFault);
          vec3 col = uColor * (1.6 * k + 0.08);
          col += uSelected * vec3(0.25, 0.35, 0.5);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  }

  private makeHaloPoints(curve: PolylineCurve3, color: THREE.Color, stroke: NeonStroke, order: Order): THREE.Points {
    const length = curve.getLength()
    const spacing = 160 / Math.max(0.2, this.settings.haloDensity)
    const count = Math.max(2, Math.floor(length / spacing))
    const positions = new Float32Array(count * 3)
    const tmp = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      curve.getPoint(i / (count - 1), tmp)
      positions[i * 3] = tmp.x
      positions[i * 3 + 1] = tmp.y
      positions[i * 3 + 2] = tmp.z
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color,
      size: stroke.tubeDiameter * 9,
      map: this.haloTex,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    const pts = new THREE.Points(geo, mat)
    pts.renderOrder = 0
    return pts
  }

  private frameCamera(board: BoardSpec) {
    const dist = Math.max(board.width, board.height) * 1.4
    this.camera.position.set(dist * 0.55, dist * 0.3, dist)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  setSelected(id: string | null) {
    for (const rt of this.runtimes) {
      rt.glowMat.uniforms.uSelected.value = rt.stroke.id === id ? 1 : 0
    }
  }

  updateSettings(settings: AppSettings) {
    const needsRebuild =
      settings.haloDensity !== this.settings.haloDensity ||
      JSON.stringify(settings.colorPresets) !== JSON.stringify(this.settings.colorPresets)
    this.settings = settings
    this.bloom.strength = settings.bloomStrength
    this.bloom.radius = settings.bloomRadius
    this.applyBloomResolution()
    if (needsRebuild && this.order) this.rebuildStrokes(this.order)
  }

  private applyBloomResolution() {
    const w = this.container.clientWidth || 800
    const h = this.container.clientHeight || 600
    const r = this.settings.bloomResolution
    this.composer.setSize(w, h)
    this.bloom.setSize(w * r, h * r)
  }

  private animate() {
    this.raf = requestAnimationFrame(this.animate)
    const dt = this.clock.getDelta()
    const t = this.clock.elapsedTime
    this.controls.update()

    for (const rt of this.runtimes) {
      rt.glowMat.uniforms.uTime.value = t
      // 点光源跟随灯管中段强度，保证动态灯光与管体同步
      if (rt.light && rt.light.visible) {
        const k = intensityAt(rt.stroke.animation, rt.lightU, t, this.order!.animation, rt.stroke.faultRange)
        rt.light.intensity = 6 * k + 0.4
      }
    }

    this.composer.render()

    // FPS 统计
    this.frameCount++
    this.fpsTimer += dt
    if (this.fpsTimer >= 1) {
      this.fps = Math.round(this.frameCount / this.fpsTimer)
      this.frameCount = 0
      this.fpsTimer = 0
    }
  }

  getFps(): number {
    return this.fps
  }

  /** 截图：返回 dataURL（preserveDrawingBuffer 已开启） */
  screenshot(): string {
    this.composer.render()
    return this.renderer.domElement.toDataURL('image/png')
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.applyBloomResolution()
  }

  private disposeStrokes() {
    for (const rt of this.runtimes) {
      this.strokeGroup.remove(rt.group)
      rt.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m.dispose()
        }
      })
    }
    this.runtimes = []
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.disposeStrokes()
    this.boardMesh?.geometry.dispose()
    ;(this.boardMesh?.material as THREE.Material | undefined)?.dispose()
    this.controls.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.haloTex.dispose()
    this.woodTex.dispose()
    this.metalTex.dispose()
    this.renderer.domElement.remove()
  }
}
