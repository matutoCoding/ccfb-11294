import type { AppSettings, Order, QuoteResult, TubeRun } from '../types';
import { BOARD_MATERIALS, colorById } from '../constants';

export function calcQuote(order: Order, settings: AppSettings): QuoteResult {
  const totalLengthMm = order.runs.reduce((a, r) => a + r.lengthMm, 0);
  const totalLengthM = totalLengthMm / 1000;

  // 按颜色分组的灯管明细
  const byColor = new Map<string, { count: number; lengthMm: number }>();
  for (const run of order.runs) {
    const g = byColor.get(run.colorId) ?? { count: 0, lengthMm: 0 };
    g.count += 1;
    g.lengthMm += run.lengthMm;
    byColor.set(run.colorId, g);
  }

  const lines = [];
  for (const [colorId, g] of byColor) {
    const preset = colorById(colorId);
    const meters = g.lengthMm / 1000;
    lines.push({
      label: `${preset.name}霓虹灯管`,
      spec: `${preset.process} · ${order.runs.find((r) => r.colorId === colorId)?.diameterMm ?? 8}mm · ${g.count} 段`,
      qty: Number(meters.toFixed(2)),
      unit: '米',
      unitPrice: preset.pricePerMeter,
      amount: Number((meters * preset.pricePerMeter).toFixed(2)),
    });
  }

  // 人工弯管费
  if (totalLengthM > 0) {
    lines.push({
      label: '弯管人工',
      spec: '按总灯管长度',
      qty: Number(totalLengthM.toFixed(2)),
      unit: '米',
      unitPrice: settings.laborPerMeter,
      amount: Number((totalLengthM * settings.laborPerMeter).toFixed(2)),
    });
  }

  // 背板
  const boardAreaM2 = (order.board.widthMm * order.board.heightMm) / 1_000_000;
  const matDef = BOARD_MATERIALS.find((m) => m.id === order.board.material)!;
  const matPrice =
    order.board.material === 'acrylic'
      ? settings.acrylicPerM2
      : order.board.material === 'metal'
        ? settings.metalPerM2
        : settings.woodPerM2;
  lines.push({
    label: `${matDef.name}背板`,
    spec: `${order.board.widthMm}×${order.board.heightMm}×${order.board.thicknessMm}mm`,
    qty: Number(boardAreaM2.toFixed(3)),
    unit: 'm²',
    unitPrice: matPrice,
    amount: Number((boardAreaM2 * matPrice).toFixed(2)),
  });

  // 变压器：按总功率与单台上限配置
  const totalWatt = totalLengthM * settings.transformerWattPerMeter;
  const transformerCount = Math.max(0, Math.ceil(totalWatt / Math.max(1, settings.transformerMaxWatt)));
  if (transformerCount > 0) {
    lines.push({
      label: '霓虹变压器',
      spec: `单台 ≤${settings.transformerMaxWatt}W · 总负载 ${totalWatt.toFixed(0)}W`,
      qty: transformerCount,
      unit: '台',
      unitPrice: settings.transformerUnitPrice,
      amount: Number((transformerCount * settings.transformerUnitPrice).toFixed(2)),
    });
  }

  // 电极：每段灯管两端各一只
  const electrodes = order.runs.length * 2;
  if (electrodes > 0) {
    lines.push({
      label: '电极头',
      spec: '每段灯管 2 只',
      qty: electrodes,
      unit: '只',
      unitPrice: settings.electrodeUnitPrice,
      amount: Number((electrodes * settings.electrodeUnitPrice).toFixed(2)),
    });
  }

  const subtotal = Number(lines.reduce((a, l) => a + l.amount, 0).toFixed(2));
  const tax = Number((subtotal * settings.taxRate).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));
  return { lines, subtotal, tax, total, totalLengthMm, totalWatt: totalWatt, transformerCount };
}

export function runWatt(run: TubeRun, settings: AppSettings): number {
  return (run.lengthMm / 1000) * settings.transformerWattPerMeter;
}
