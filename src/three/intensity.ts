import type { AnimationSpec, TubeAnimMode } from '../types'

/** 确定性 hash，JS 与 GLSL 实现保持同一公式 */
export function hash1(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * 灯管在弧长位置 u(0~1)、时刻 t(秒) 的发光强度。
 * JS 版本用于点光源/辉光精灵同步；GLSL 版本见 glslIntensity。
 */
export function intensityAt(
  mode: TubeAnimMode,
  u: number,
  t: number,
  anim: AnimationSpec,
  fault: { from: number; to: number },
): number {
  const speed = anim.speed
  switch (mode) {
    case 'steady':
      return 1
    case 'flicker': {
      const h = hash1(Math.floor(t * speed * anim.flickerRate * 9))
      if (h < 0.12) return 0.08 + 0.3 * hash1(Math.floor(t * 37))
      if (h < 0.22) return 0.55
      return 1
    }
    case 'chase': {
      const period = anim.chasePeriod / Math.max(0.1, speed)
      const phase = (u - t / period) % 1
      const p = phase < 0 ? phase + 1 : phase
      const wave = Math.pow(0.5 + 0.5 * Math.sin(p * Math.PI * 2 - Math.PI / 2), 3)
      return 0.12 + 0.88 * wave
    }
    case 'fault': {
      if (u < fault.from || u > fault.to) return 1
      const h = hash1(Math.floor(t * speed * anim.faultRate * 22))
      if (h < 0.45) return 0.05
      if (h < 0.65) return 0.3 + 0.4 * hash1(Math.floor(t * 51))
      return 1
    }
  }
}

/** 与 intensityAt 逐分支对应的 GLSL 函数体 */
export const glslIntensity = /* glsl */ `
float hash1(float n){ return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

float intensityAt(int mode, float u, float t, float speed, float flickerRate,
                  float chasePeriod, float faultRate, vec2 faultRange) {
  if (mode == 0) return 1.0;
  if (mode == 1) {
    float h = hash1(floor(t * speed * flickerRate * 9.0));
    if (h < 0.12) return 0.08 + 0.3 * hash1(floor(t * 37.0));
    if (h < 0.22) return 0.55;
    return 1.0;
  }
  if (mode == 2) {
    float period = chasePeriod / max(0.1, speed);
    float phase = fract(u - t / period);
    float wave = pow(0.5 + 0.5 * sin(phase * 6.28318 - 1.5708), 3.0);
    return 0.12 + 0.88 * wave;
  }
  // mode 3: 接触不良，仅 faultRange 区间闪烁
  if (u < faultRange.x || u > faultRange.y) return 1.0;
  float h = hash1(floor(t * speed * faultRate * 22.0));
  if (h < 0.45) return 0.05;
  if (h < 0.65) return 0.3 + 0.4 * hash1(floor(t * 51.0));
  return 1.0;
}
`

export const MODE_INDEX: Record<TubeAnimMode, number> = {
  steady: 0,
  flicker: 1,
  chase: 2,
  fault: 3,
}
