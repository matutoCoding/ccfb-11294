import { useRef } from 'react';
import { useOrderStore, useSettingsStore, clearAllOrders } from '../store/useStores';
import { useToast } from '../components/toast';
import { readFileAsText } from '../lib/util';

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);
  const exportAll = useOrderStore((s) => s.exportAll);
  const importJson = useOrderStore((s) => s.importJson);
  const orders = useOrderStore((s) => s.orders);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const num = (v: string) => Number(v) || 0;

  return (
    <div className="page-pad" style={{ maxWidth: 980, margin: '0 auto' }}>
      <div className="panel">
        <h3>默认工艺参数</h3>
        <div className="row">
          <div className="field">
            <label>默认最小弯管半径 (mm)</label>
            <input
              type="number"
              value={settings.defaultBendRadiusMm}
              onChange={(e) => update({ defaultBendRadiusMm: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>默认管径 (mm)</label>
            <input
              type="number"
              value={settings.defaultTubeDiameterMm}
              onChange={(e) => update({ defaultTubeDiameterMm: num(e.target.value) })}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>默认背板宽 (mm)</label>
            <input
              type="number"
              value={settings.defaultBoardWidthMm}
              onChange={(e) => update({ defaultBoardWidthMm: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>默认背板高 (mm)</label>
            <input
              type="number"
              value={settings.defaultBoardHeightMm}
              onChange={(e) => update({ defaultBoardHeightMm: num(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>报价参数</h3>
        <div className="row">
          <div className="field">
            <label>弯管人工（元/米）</label>
            <input
              type="number"
              value={settings.laborPerMeter}
              onChange={(e) => update({ laborPerMeter: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>亚克力背板（元/m²）</label>
            <input
              type="number"
              value={settings.acrylicPerM2}
              onChange={(e) => update({ acrylicPerM2: num(e.target.value) })}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>金属背板（元/m²）</label>
            <input
              type="number"
              value={settings.metalPerM2}
              onChange={(e) => update({ metalPerM2: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>木纹背板（元/m²）</label>
            <input
              type="number"
              value={settings.woodPerM2}
              onChange={(e) => update({ woodPerM2: num(e.target.value) })}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>变压器功耗（W/米灯管）</label>
            <input
              type="number"
              value={settings.transformerWattPerMeter}
              onChange={(e) => update({ transformerWattPerMeter: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>单台变压器上限 (W)</label>
            <input
              type="number"
              value={settings.transformerMaxWatt}
              onChange={(e) => update({ transformerMaxWatt: num(e.target.value) })}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>变压器单价（元/台）</label>
            <input
              type="number"
              value={settings.transformerUnitPrice}
              onChange={(e) => update({ transformerUnitPrice: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>电极头单价（元/只）</label>
            <input
              type="number"
              value={settings.electrodeUnitPrice}
              onChange={(e) => update({ electrodeUnitPrice: num(e.target.value) })}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>税率（0.13 = 13%）</label>
            <input
              type="number"
              step={0.01}
              value={settings.taxRate}
              onChange={(e) => update({ taxRate: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>货币符号</label>
            <input value={settings.currency} onChange={(e) => update({ currency: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>数据管理</h3>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          全部订单保存在本浏览器 localStorage（当前 {orders.length} 个订单）。清除浏览器数据前请先导出备份。
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={exportAll} disabled={orders.length === 0}>
            导出全部订单 JSON
          </button>
          <button onClick={() => fileRef.current?.click()}>导入订单 JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const r = importJson(await readFileAsText(file));
                toast(`导入 ${r.added} 个订单`, 'ok');
              } catch (err) {
                toast(err instanceof Error ? err.message : '导入失败', 'err');
              } finally {
                e.target.value = '';
              }
            }}
          />
          <button
            className="danger"
            onClick={() => {
              if (confirm('恢复全部设置为默认值？订单数据不受影响。')) {
                reset();
                toast('设置已恢复默认', 'ok');
              }
            }}
          >
            恢复默认设置
          </button>
          <button
            className="danger"
            onClick={async () => {
              if (confirm('清空本机全部订单？建议先导出备份，此操作不可恢复！')) {
                await clearAllOrders();
                location.reload();
              }
            }}
          >
            清空全部订单
          </button>
        </div>
      </div>

      <div className="panel">
        <h3>关于</h3>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
          霓虹灯牌设计预览系统 v1.0 · React 18 + TypeScript + three.js
          <br />
          排管流程：文字/SVG 栅格化 → Zhang-Suen 笔画细化 → 骨架图提取与短枝修剪 → 交叉点直通配对 →
          相切圆弧弯管（保证最小半径）→ 自交/间距/越界校验
        </div>
      </div>
    </div>
  );
}
