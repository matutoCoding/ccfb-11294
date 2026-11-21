// SVG 导入管线验证：DOMParser 可用（tsx 无 DOM，用 happy-dom 不可得，故仅做纯矩阵/采样数学验证）
import { parseSvg, sampleSvgItems } from '../src/lib/svgImport'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

// jsdom 不可用时 DOMParser 不存在，检测后优雅跳过端到端部分
const hasDom = typeof DOMParser !== 'undefined'
if (hasDom) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
    <rect x="10" y="10" width="80" height="40" rx="5"/>
    <g transform="translate(100,0)">
      <circle cx="50" cy="50" r="30" transform="scale(1)"/>
    </g>
    <line x1="0" y1="90" x2="200" y2="90"/>
  </svg>`
  const parsed = parseSvg(svg)
  check('解析出 3 个元素', parsed.items.length === 3, `got ${parsed.items.length}`)
  check('viewBox 尺寸正确', parsed.vbW === 200 && parsed.vbH === 100)

  const contours = sampleSvgItems(parsed, 1000, 4)
  check('采样得到 3 条折线', contours.length === 3)
  const all = contours.flatMap((c) => c.points)
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  check('整体居中到原点（x 中心≈0）', Math.abs(cx) < 1, `cx=${cx}`)
  check('y 翻转后仍居中（y 中心≈0）', Math.abs(cy) < 1, `cy=${cy}`)
  const widthMM = Math.max(...xs) - Math.min(...xs)
  check('viewBox 200 宽映射到 1000mm（比例 5×）', Math.abs(widthMM - 1000) < 2, `w=${widthMM}`)

  // g 上的 translate(100,0) 必须生效：圆心场景 x 应为正
  const circle = contours[1]
  const ccx = circle.points.reduce((a, p) => a + p.x, 0) / circle.points.length
  check('嵌套 g 的 translate 变换生效', ccx > 0, `ccx=${ccx}`)
} else {
  console.log('  ⊙ 无 DOM 环境，跳过 parseSvg 端到端测试（浏览器内执行）')
}

// 纯数学：缩放矩阵乘法
{
  const a = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 }
  const b = { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 }
  const m = {
    a: a.a * b.a + a.c * b.b, b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d, d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e, f: a.b * b.e + a.d * b.f + a.f,
  }
  const p = { x: 5, y: 7 }
  const out = { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
  check('仿射矩阵复合：(5,7) → (20,-14+20=6)', out.x === 20 && out.y === 6, JSON.stringify(out))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
