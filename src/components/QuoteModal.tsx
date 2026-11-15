import { useMemo } from 'react';
import type { Order } from '../types';
import { useSettingsStore } from '../store/useStores';
import { calcQuote } from '../core/quote';
import { colorById } from '../constants';

interface Props {
  order: Order;
  onClose: () => void;
}

export default function QuoteModal({ order, onClose }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const quote = useMemo(() => calcQuote(order, settings), [order, settings]);
  const c = settings.currency;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(820px, 94vw)' }}>
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>报价单 · {order.name}</h2>
          <button className="ghost small" onClick={onClose}>
            ✕ 关闭
          </button>
        </div>

        <div id="printable-quote" style={{ background: '#fff', color: '#111', borderRadius: 10, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>霓虹灯牌定制报价单</div>
              <div style={{ fontSize: 12, color: '#666' }}>订单编号：{order.id.slice(-10).toUpperCase()}</div>
            </div>
            <div style={{ fontSize: 12, color: '#666', textAlign: 'right' }}>
              <div>出具日期：{new Date().toLocaleDateString('zh-CN')}</div>
              <div>
                背板：{order.board.widthMm}×{order.board.heightMm}mm
              </div>
            </div>
          </div>

          <table style={{ color: '#111' }}>
            <thead>
              <tr style={{ background: '#f3f5f9' }}>
                <th style={{ color: '#333' }}>项目</th>
                <th style={{ color: '#333' }}>规格说明</th>
                <th style={{ color: '#333' }}>数量</th>
                <th style={{ color: '#333' }}>单位</th>
                <th style={{ color: '#333' }}>单价</th>
                <th style={{ color: '#333' }}>金额</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.label}</td>
                  <td style={{ color: '#555', fontSize: 12 }}>{l.spec}</td>
                  <td className="mono">{l.qty}</td>
                  <td>{l.unit}</td>
                  <td className="mono">
                    {c}
                    {l.unitPrice}
                  </td>
                  <td className="mono">
                    {c}
                    {l.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
                灯管配色：
                {[...new Set(order.runs.map((r) => r.colorId))].map((id) => (
                  <span
                    key={id}
                    style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: colorById(id).core,
                      margin: '0 4px 0 6px',
                      verticalAlign: 'middle',
                      boxShadow: `0 0 6px ${colorById(id).glow}`,
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#555' }}>
                灯管总长：<b>{(quote.totalLengthMm / 1000).toFixed(2)} m</b>　·　估算总功率：
                <b>{quote.totalWatt.toFixed(0)} W</b>　·　变压器：<b>{quote.transformerCount} 台</b>
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
                注：报价含 {(settings.taxRate * 100).toFixed(0)}% 税费；最终价格以实际打样为准。
              </div>
            </div>
            <div style={{ minWidth: 220 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span>小计</span>
                <span className="mono">
                  {c}
                  {quote.subtotal.toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span>税费 {(settings.taxRate * 100).toFixed(0)}%</span>
                <span className="mono">
                  {c}
                  {quote.tax.toFixed(2)}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0 4px',
                  fontSize: 18,
                  fontWeight: 700,
                  borderTop: '2px solid #111',
                  marginTop: 6,
                }}
              >
                <span>合计</span>
                <span className="mono">
                  {c}
                  {quote.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={() => {
              const node = document.getElementById('printable-quote');
              const win = window.open('', '_blank');
              if (!win || !node) return;
              win.document.write(`<html><head><title>报价单 ${order.name}</title></head><body>${node.outerHTML}</body></html>`);
              win.document.close();
              win.focus();
              setTimeout(() => win.print(), 300);
            }}
          >
            打印 / 另存 PDF
          </button>
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
