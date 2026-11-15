import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderStore } from '../store/useStores';
import { useToast } from '../components/toast';
import { readFileAsText } from '../lib/util';
import type { Order } from '../types';
import QuoteModal from '../components/QuoteModal';

export default function OrdersPage() {
  const orders = useOrderStore((s) => s.orders);
  const currentId = useOrderStore((s) => s.currentId);
  const create = useOrderStore((s) => s.create);
  const remove = useOrderStore((s) => s.remove);
  const duplicate = useOrderStore((s) => s.duplicate);
  const rename = useOrderStore((s) => s.rename);
  const select = useOrderStore((s) => s.select);
  const exportJson = useOrderStore((s) => s.exportJson);
  const exportAll = useOrderStore((s) => s.exportAll);
  const importJson = useOrderStore((s) => s.importJson);
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [quoteOrder, setQuoteOrder] = useState<Order | null>(null);

  const totalLength = (o: Order) => o.runs.reduce((a, r) => a + r.lengthMm, 0);

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const result = importJson(text);
      toast(`导入成功 ${result.added} 个订单${result.skipped ? `，跳过 ${result.skipped} 个` : ''}`, 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'err');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page-pad">
      <div className="panel" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, flex: 1 }}>订单列表（{orders.length}）</h2>
          <button
            className="primary"
            onClick={() => {
              const order = create();
              select(order.id);
              navigate('/layout');
            }}
          >
            + 新建订单
          </button>
          <button onClick={exportAll} disabled={orders.length === 0}>
            全部导出
          </button>
          <button onClick={() => fileRef.current?.click()}>导入订单</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => void handleImport(e.target.files?.[0])}
          />
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="panel empty" style={{ height: 360 }}>
          <div style={{ fontSize: 40 }}>🪧</div>
          <div>还没有订单，点击「新建订单」开始设计第一块霓虹灯牌</div>
          <div className="muted" style={{ fontSize: 12 }}>
            数据保存在本浏览器 localStorage，可随时导出 JSON 备份或换机导入
          </div>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>订单名称</th>
                <th>内容</th>
                <th>背板尺寸</th>
                <th>灯管段数</th>
                <th>总长度</th>
                <th>更新时间</th>
                <th style={{ width: 340 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={o.id === currentId ? { background: 'rgba(56,189,248,0.06)' } : undefined}>
                  <td>
                    {editingId === o.id ? (
                      <input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => {
                          if (draftName.trim()) rename(o.id, draftName.trim());
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        style={{ maxWidth: 180 }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600 }}>{o.name}</span>
                    )}
                  </td>
                  <td className="dim">{o.source.type === 'text' ? o.source.text : o.source.fileName ?? 'SVG 图形'}</td>
                  <td className="mono dim">
                    {o.board.widthMm}×{o.board.heightMm}
                  </td>
                  <td>{o.runs.length}</td>
                  <td className="mono">{(totalLength(o) / 1000).toFixed(2)} m</td>
                  <td className="dim">{new Date(o.updatedAt).toLocaleString('zh-CN', { hour12: false })}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        className="small primary"
                        onClick={() => {
                          select(o.id);
                          navigate('/layout');
                        }}
                      >
                        打开
                      </button>
                      <button
                        className="small"
                        onClick={() => {
                          setEditingId(o.id);
                          setDraftName(o.name);
                        }}
                      >
                        重命名
                      </button>
                      <button className="small" onClick={() => setQuoteOrder(o)}>
                        报价单
                      </button>
                      <button
                        className="small"
                        onClick={() => {
                          const copy = duplicate(o.id);
                          if (copy) toast('已复制订单', 'ok');
                        }}
                      >
                        复制
                      </button>
                      <button className="small" onClick={() => exportJson(o.id)}>
                        导出
                      </button>
                      <button
                        className="small danger"
                        onClick={() => {
                          if (confirm(`确认删除订单「${o.name}」？此操作不可恢复。`)) {
                            remove(o.id);
                            toast('订单已删除', 'info');
                          }
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quoteOrder && <QuoteModal order={quoteOrder} onClose={() => setQuoteOrder(null)} />}
    </div>
  );
}
