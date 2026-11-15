import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import OrdersPage from './pages/OrdersPage';
import LayoutPage from './pages/LayoutPage';
import BoardPage from './pages/BoardPage';
import PreviewPage from './pages/PreviewPage';
import SettingsPage from './pages/SettingsPage';
import { useOrderStore } from './store/useStores';
import { useFontStore } from './store/fontStore';
import { useToastStore } from './components/toast';

const NAV = [
  { to: '/orders', label: '订单列表' },
  { to: '/layout', label: '灯管排线' },
  { to: '/board', label: '背板材质' },
  { to: '/preview', label: '夜景预览' },
  { to: '/settings', label: '设置' },
];

export default function App() {
  const hydrate = useOrderStore((s) => s.hydrate);
  const orders = useOrderStore((s) => s.orders);
  const currentId = useOrderStore((s) => s.currentId);
  const initFonts = useFontStore((s) => s.init);
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.remove);
  const navigate = useNavigate();

  useEffect(() => {
    void hydrate();
    void initFonts();
  }, [hydrate, initFonts]);

  const current = orders.find((o) => o.id === currentId) ?? null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" />
          霓虹灯牌设计室
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        {current && (
          <span
            className="order-pill"
            title="点击切换订单"
            onClick={() => navigate('/orders')}
            style={{ cursor: 'pointer' }}
          >
            当前订单：{current.name}
          </span>
        )}
      </header>

      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/layout" element={<LayoutPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => removeToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
