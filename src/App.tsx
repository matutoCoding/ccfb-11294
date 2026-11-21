import { useState } from 'react'
import {
  ClipboardList, Spline, Layers, Moon, Settings as SettingsIcon, Plus,
} from 'lucide-react'
import { ToastProvider } from './components/Toast'
import { OrdersPage } from './pages/OrdersPage'
import { LayoutPage } from './pages/LayoutPage'
import { BoardPage } from './pages/BoardPage'
import { NightPage } from './pages/NightPage'
import { SettingsPage } from './pages/SettingsPage'
import { useOrders } from './store/orderStore'

const TABS = [
  { key: 'orders', label: '订单列表', icon: ClipboardList },
  { key: 'layout', label: '灯管排线', icon: Spline },
  { key: 'board', label: '背板材质', icon: Layers },
  { key: 'night', label: '夜景预览', icon: Moon },
  { key: 'settings', label: '设置', icon: SettingsIcon },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function App() {
  const [tab, setTab] = useState<TabKey>('orders')
  const orderCount = useOrders((s) => s.orders.length)
  const currentId = useOrders((s) => s.currentId)
  const create = useOrders((s) => s.create)

  const needsOrder = tab !== 'orders' && tab !== 'settings'
  const current = useOrders((s) => s.orders.find((o) => o.id === s.currentId))

  return (
    <ToastProvider>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">NEON STUDIO</div>
          {TABS.map(({ key, label, icon: Icon }) => (
            <div
              key={key}
              className={`nav-item ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={16} />
              {label}
              {key === 'orders' && orderCount > 0 && <span className="badge">{orderCount}</span>}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <button className="primary" onClick={() => { create(); setTab('layout') }}>
            <Plus size={14} style={{ verticalAlign: -2 }} /> 新建订单
          </button>
        </nav>

        <main className="main">
          <header className="topbar">
            <h2>{TABS.find((t) => t.key === tab)?.label}</h2>
            {current && (
              <span className="tag quoted mono">{current.code}{current.customer ? ` · ${current.customer}` : ''}</span>
            )}
            <div className="spacer" />
            {needsOrder && !currentId && (
              <button className="primary small" onClick={() => { create(); setTab('layout') }}>先新建一个订单</button>
            )}
          </header>

          <div className="content">
            {tab === 'orders' && <OrdersPage onOpen={() => setTab('layout')} />}
            {tab === 'layout' && <LayoutPage />}
            {tab === 'board' && <BoardPage />}
            {tab === 'night' && <NightPage />}
            {tab === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>
    </ToastProvider>
  )
}
