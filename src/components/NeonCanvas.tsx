import { useEffect, useRef } from 'react'
import type { Order } from '../types'
import { useSettings } from '../store/settingsStore'
import { NeonEngine } from '../three/NeonEngine'

interface Props {
  order: Order
  selectedStrokeId?: string | null
  onEngine?: (engine: NeonEngine) => void
  onFps?: (fps: number) => void
}

/** three.js 舞台的 React 包装：引擎实例随容器存活，订单/设置变化做增量同步 */
export function NeonCanvas({ order, selectedStrokeId, onEngine, onFps }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const engineRef = useRef<NeonEngine | null>(null)
  const settings = useSettings()

  useEffect(() => {
    if (!ref.current) return
    const engine = new NeonEngine(ref.current, useSettings.getState())
    engineRef.current = engine
    onEngine?.(engine)
    const timer = window.setInterval(() => onFps?.(engine.getFps()), 1000)
    return () => {
      window.clearInterval(timer)
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    engineRef.current?.setOrder(order)
  }, [order])

  useEffect(() => {
    engineRef.current?.updateSettings(settings)
  }, [settings])

  useEffect(() => {
    engineRef.current?.setSelected(selectedStrokeId ?? null)
  }, [selectedStrokeId])

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
}
