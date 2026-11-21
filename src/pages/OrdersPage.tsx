import { useRef, useState } from 'react'
import { Copy, Pencil, Plus, Trash2, Upload, Download, FileText } from 'lucide-react'
import { useOrders } from '../store/orderStore'
import { calcQuote, downloadBlob, fmtMoney } from '../lib/quote'
import { useToast } from '../components/Toast'
import type { Order } from '../types'

const STATUS_LABEL: Record<Order['status'], string> = {
  draft: '草稿', quoted: '已报价', producing: '制作中', done: '已完成',
}

export function OrdersPage({ onOpen }: { onOpen: () => void }) {
  const orders = useOrders((s) => s.orders)
  const { create, remove, duplicate, select, update, importOrders, replaceAll } = useOrders()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<Order | null>(null)

  const exportAll = () => {
    if (!orders.length) return toast.show('没有可导出的订单', 'err')
    downloadBlob(JSON.stringify(orders, null, 2), `neon-orders-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
    toast.show(`已导出 ${orders.length} 个订单`, 'ok')
  }

  const exportOne = (o: Order) => {
    downloadBlob(JSON.stringify(o, null, 2), `${o.code}.json`, 'application/json')
  }

  const onImportFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text())
      const list = Array.isArray(data) ? data : [data]
      const n = importOrders(list)
      if (!n) throw new Error('文件里没有有效订单')
      toast.show(`成功导入 ${n} 个订单`, 'ok')
    } catch (e) {
      toast.show(`导入失败：${(e as Error).message}`, 'err')
    }
  }

  return (
    <div className="grid" style={{ maxWidth: 1200 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="muted">订单数据保存在浏览器 localStorage，可导出 JSON 备份或迁移到其他电脑</div>
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.target.value = ''
            }}
          />
          <button onClick={() => fileRef.current?.click()}><Upload size={13} style={{ verticalAlign: -2 }} /> 导入</button>
          <button onClick={exportAll}><Download size={13} style={{ verticalAlign: -2 }} /> 导出全部</button>
          <button className="primary" onClick={() => { create(); onOpen() }}><Plus size={14} style={{ verticalAlign: -2 }} /> 新建订单</button>
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        {orders.length === 0 ? (
          <div className="empty">
            <div className="icon">📋</div>
            <div>还没有订单，点击「新建订单」开始设计霓虹灯牌</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>订单编号</th><th>客户</th><th>状态</th>
                <th>灯管数</th><th>总长 (m)</th><th>预估报价</th><th>更新时间</th><th style={{ width: 250 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const q = calcQuote(o)
                return (
                  <tr key={o.id}>
                    <td className="mono">{o.code}</td>
                    <td>{o.customer || <span className="muted">未命名</span>}</td>
                    <td><span className={`tag ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                    <td>{o.strokes.length}</td>
                    <td>{q.totalLengthM.toFixed(2)}</td>
                    <td>{fmtMoney(q.total)}</td>
                    <td className="muted">{new Date(o.updatedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="small" onClick={() => { select(o.id); onOpen() }}><Pencil size={12} /> 设计</button>
                        <button className="small" onClick={() => setEditing(o)}>信息</button>
                        <button className="small" onClick={() => duplicate(o.id)}><Copy size={12} /> 复制</button>
                        <button className="small" onClick={() => exportOne(o)}><Download size={12} /></button>
                        <button className="small danger" onClick={() => { if (confirm(`确定删除订单 ${o.code}？`)) remove(o.id) }}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>编辑订单信息</h3>
            <div className="field">
              <label>订单编号</label>
              <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            </div>
            <div className="field">
              <label>客户名称</label>
              <input value={editing.customer} onChange={(e) => setEditing({ ...editing, customer: e.target.value })} />
            </div>
            <div className="field">
              <label>状态</label>
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Order['status'] })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label>备注</label>
              <textarea rows={3} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setEditing(null)}>取消</button>
              <button className="primary" onClick={() => { update(editing.id, editing); setEditing(null); toast.show('已保存', 'ok') }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {orders.length > 0 && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="danger small" onClick={() => {
            if (confirm('确定清空全部订单？建议先导出备份。')) { replaceAll([]); toast.show('已清空', 'info') }
          }}><FileText size={12} /> 清空全部</button>
        </div>
      )}
    </div>
  )
}
