// 端到端：下载真实 TTF → 文字轮廓 → 采样 → 圆角 → 自交检测 → 灯管
import opentype from 'opentype.js'
import { textToContours } from '../src/lib/textToPath'
import { buildStrokes } from '../src/lib/strokeBuilder'
import type { AppSettings } from '../src/types'

const settings: AppSettings = {
  minBendRadius: 12,
  sampleSpacing: 4,
  selfIntersectCheck: true,
  bloomStrength: 1.15,
  bloomRadius: 0.7,
  bloomResolution: 0.75,
  haloDensity: 1,
  colorPresets: [],
  customFonts: [],
}

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

async function main() {
  const url = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/monoton/Monoton_400Regular.ttf'
  console.log('下载字体 Monoton ...')
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const font = opentype.parse(buf.buffer.slice(0))

  const contours = textToContours(font, 'NEON', 900)
  check('NEON 生成多个子轮廓', contours.length >= 4, `got ${contours.length}`)
  check('每个轮廓带闭合标记', contours.every((c) => typeof c.closed === 'boolean'))

  const built = buildStrokes({
    contours,
    colorId: 'neon-red',
    tubeDiameter: 8,
    settings,
    namePrefix: 'NEON',
  })
  check('生成的灯管数 <= 轮廓数（微小内孔被过滤）', built.strokes.length <= contours.length && built.strokes.length > 0)
  check('所有灯管长度 > 2 倍管径（16mm）', built.strokes.every((s) => s.length > 16),
    `min=${Math.min(...built.strokes.map((s) => s.length)).toFixed(1)}`)
  // Monoton 含 1~3mm 级细节，12mm 半径物理不可达：出现的是“硬折点/降级”告警而非自交错误
  const errors = built.warnings.filter((w) => w.level === 'error')
  check('无路径自交硬错误（细节降级只产生告警）', errors.length === 0, JSON.stringify(errors.slice(0, 3)))
  if (built.warnings.length) console.log(`  ℹ 工艺告警 ${built.warnings.length} 条（字体细节小于弯管半径，符合预期）`)

  // 坐标应在背板合理范围内（目标宽 900mm）
  const allX = built.strokes.flatMap((s) => s.points.map((p) => p.x))
  const width = Math.max(...allX) - Math.min(...allX)
  check('文字宽度接近目标 900mm（±5%）', Math.abs(width - 900) / 900 < 0.05, `w=${width.toFixed(1)}`)
  const allY = built.strokes.flatMap((s) => s.points.map((p) => p.y))
  check('文字整体居中（x/y 中心≈0）',
    Math.abs((Math.min(...allX) + Math.max(...allX)) / 2) < 2 &&
    Math.abs((Math.min(...allY) + Math.max(...allY)) / 2) < 2)

  // 最小半径约束：可做圆角的转角实测半径；硬折点（字体细节）允许存在，由工艺告警覆盖
  let minR = Infinity
  let checked = 0
  for (const s of built.strokes) {
    for (let i = 1; i < s.points.length - 1; i++) {
      const a = { x: s.points[i].x - s.points[i - 1].x, y: s.points[i].y - s.points[i - 1].y }
      const b = { x: s.points[i + 1].x - s.points[i].x, y: s.points[i + 1].y - s.points[i].y }
      const area = Math.abs(a.x * b.y - a.y * b.x) / 2
      if (area > 1e-9) {
        const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y)
        const lc = Math.hypot(s.points[i + 1].x - s.points[i - 1].x, s.points[i + 1].y - s.points[i - 1].y)
        const R = (la * lb * lc) / (4 * area)
        // 只统计边长足够（>24mm，即 2×rMin）的转角，这类转角必须满足半径约束
        if (la > 24 && lb > 24) { minR = Math.min(minR, R); checked++ }
      }
    }
  }
  check(`充足边长转角的曲率半径 >= 11mm（实测 ${minR === Infinity ? 'N/A' : minR.toFixed(1)}mm，检查 ${checked} 处）`,
    checked === 0 || minR >= 11)

  const totalM = built.strokes.reduce((a, s) => a + s.length, 0) / 1000
  console.log(`  ℹ NEON 共 ${built.strokes.length} 根灯管，总长 ${totalM.toFixed(2)}m`)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
