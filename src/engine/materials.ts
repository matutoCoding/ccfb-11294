import * as THREE from 'three';

export interface CoreMaterialOptions {
  coreColor: THREE.Color;
  glowColor: THREE.Color;
  radius: number;
}

/**
 * 内部发光芯线 ShaderMaterial。
 * 圆柱表面按视角方向做余弦增亮，模拟霓虹灯管中心最亮、边缘衰减。
 * 动画：steady / flicker(确定性伪随机闪烁) / chase(流水) / broken(接触不良)
 */
export function createCoreMaterial(opts: CoreMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCoreColor: { value: opts.coreColor.clone() },
      uGlowColor: { value: opts.glowColor.clone() },
      uRadius: { value: opts.radius },
      uTime: { value: 0 },
      uMode: { value: 0 }, // 0 steady 1 flicker 2 chase 3 broken
      uSpeed: { value: 1 },
      uFlickerHz: { value: 9 },
      uChasePeriod: { value: 2.4 },
      uIntensity: { value: 1 },
      uBrokenStart: { value: -1 },
      uBrokenEnd: { value: -1 },
      uLength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      uniform vec3 uCoreColor;
      uniform vec3 uGlowColor;
      uniform float uTime;
      uniform int uMode;
      uniform float uSpeed;
      uniform float uFlickerHz;
      uniform float uChasePeriod;
      uniform float uIntensity;
      uniform float uBrokenStart;
      uniform float uBrokenEnd;
      uniform float uLength;

      float hash11(float n) {
        return fract(sin(n * 127.1 + 311.7) * 43758.5453123);
      }

      void main() {
        // 圆柱余弦增亮
        float facing = pow(max(dot(normalize(vNormalView), normalize(vViewDir)), 0.0), 0.55);
        vec3 color = mix(uGlowColor * 0.75, uCoreColor, facing);
        float brightness = 1.0;
        float t = uTime * uSpeed;

        if (uMode == 1) {
          // 闪烁：量化时间得到离散跳变，叠加慢呼吸，结果确定不随机抖动
          float hz = max(1.0, uFlickerHz);
          float q = floor(t * hz);
          float rnd = hash11(q + vUv.x * 4.0);
          float gate = rnd > 0.22 ? 1.0 : (rnd > 0.1 ? 0.45 : 0.08);
          float breathe = 0.85 + 0.15 * sin(t * 2.3 + vUv.x * 9.0);
          brightness = gate * breathe;
        } else if (uMode == 2) {
          // 流水：沿管长传播的高斯亮斑
          float phase = fract(vUv.x - t / max(0.1, uChasePeriod));
          float head = exp(-pow(phase * 6.2831, 2.0) * 0.55);
          float tail = exp(-pow((phase - 1.0) * 6.2831, 2.0) * 0.55);
          brightness = 0.18 + 0.95 * (head + tail);
        } else if (uMode == 3) {
          // 接触不良：故障段高频抽搐式熄灭，其余部分轻微不稳
          float inBroken = step(uBrokenStart, vUv.x) * step(vUv.x, uBrokenEnd);
          float qFast = floor(t * 26.0);
          float rnd = hash11(qFast + floor(vUv.x * 20.0));
          float sputter = mix(1.0, rnd > 0.42 ? (rnd > 0.8 ? 0.05 : 0.35) : 1.0, inBroken);
          float unstable = 0.9 + 0.1 * hash11(floor(t * 7.0));
          brightness = sputter * unstable;
        }

        float alpha = (0.55 + 0.35 * facing) * clamp(uIntensity, 0.2, 1.3);
        vec3 outColor = min(color * brightness * uIntensity, vec3(1.6));
        gl_FragColor = vec4(outColor, alpha * brightness);
      }
    `,
  });
}

/** 玻璃管体：高透、轻微环境反射，灯管熄灭时也能看到管壁 */
export function createGlassMaterial(radius: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.55,
    thickness: radius * 1.2,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** 电极头（陶瓷+金属） */
export function createElectrodeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x9aa0a8,
    metalness: 0.9,
    roughness: 0.35,
  });
}
