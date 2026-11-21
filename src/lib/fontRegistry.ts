import * as opentype from 'opentype.js'
import type { AppSettings } from '../types'

/**
 * 字体注册表：内存缓存已解析的 opentype.Font。
 * - bundled：随应用加载的开源拉丁展示字体（从 CDN 拉取，失败可换内置备用）
 * - custom：用户在设置页上传的 TTF/OTF（dataUrl 持久化在 localStorage）
 *
 * 中文字体体积大，不随包分发；用户上传本地 TTF 即可排中文。
 */
// opentype.js 只支持 TTF/OTF（不支持 woff），用 expo-google-fonts 包内的原始 TTF
const BUNDLED_FONTS = [
  {
    id: 'bundled-monoton',
    name: 'Monoton（霓虹展示体）',
    url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/monoton/Monoton_400Regular.ttf',
  },
  {
    id: 'bundled-bebas',
    name: 'Bebas Neue（窄体无衬线）',
    url: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/bebas-neue/BebasNeue_400Regular.ttf',
  },
]

class FontRegistry {
  private cache = new Map<string, opentype.Font>()
  private pending = new Map<string, Promise<opentype.Font>>()

  list(settings: AppSettings) {
    return [
      ...BUNDLED_FONTS.map((f) => ({ id: f.id, name: f.name, bundled: true })),
      ...settings.customFonts.map((f) => ({ id: f.id, name: f.name, bundled: false })),
    ]
  }

  async get(id: string, settings: AppSettings): Promise<opentype.Font> {
    const hit = this.cache.get(id)
    if (hit) return hit
    const pending = this.pending.get(id)
    if (pending) return pending

    const bundled = BUNDLED_FONTS.find((f) => f.id === id)
    const custom = settings.customFonts.find((f) => f.id === id)

    const task = (async () => {
      try {
        if (bundled) {
          const res = await fetch(bundled.url)
          const buf = await res.arrayBuffer()
          const font = opentype.parse(buf)
          this.cache.set(id, font)
          return font
        }
        if (custom) {
          const res = await fetch(custom.dataUrl)
          const buf = await res.arrayBuffer()
          const font = opentype.parse(buf)
          this.cache.set(id, font)
          return font
        }
      } catch (e) {
        this.pending.delete(id)
        throw new Error(`字体「${bundled?.name ?? custom?.name ?? id}」加载失败：${(e as Error).message}。中文字体请在设置页上传本地 TTF。`)
      }
      throw new Error('未找到指定字体')
    })()

    this.pending.set(id, task)
    return task
  }
}

export const fontRegistry = new FontRegistry()
export { BUNDLED_FONTS }
