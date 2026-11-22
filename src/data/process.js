/* E3：工艺参数（示意值）。与工艺流程数据解耦，后续可整体替换为真实 DCS 数据。
 * 单位：温度 °C / 压力 MPa / 处理量 t·d⁻¹ / 收率 %（质量）
 * products 为物料平衡，合计 100%
 */
export const PROCESS_PARAMS = [
  {
    stage: 0,
    cn: '原油储运',
    temp: '常温',
    pressure: '0.6',
    throughput: 20000,
    yieldMain: '—',
    note: '罐区静置脱水后由泵组加压外送',
    products: [
      { name: '原油', pct: 100 },
      { name: '汽油', pct: 0 },
      { name: '柴油 / 航煤', pct: 0 },
      { name: '渣油', pct: 0 },
    ],
  },
  {
    stage: 1,
    cn: '常减压蒸馏',
    temp: '350',
    pressure: '0.13',
    throughput: 20000,
    yieldMain: '石脑油 18%',
    note: '常压塔顶 120 °C，减压塔底 380 °C',
    products: [
      { name: '石脑油', pct: 18 },
      { name: '煤油 / 航煤', pct: 12 },
      { name: '柴油', pct: 24 },
      { name: '蜡油 / 渣油', pct: 46 },
    ],
  },
  {
    stage: 2,
    cn: '催化裂化',
    temp: '510',
    pressure: '0.21',
    throughput: 9000,
    yieldMain: '汽油 46%',
    note: '反应温度 510 °C，剂油比 6.5',
    products: [
      { name: '催化汽油', pct: 46 },
      { name: '液化气', pct: 14 },
      { name: '柴油', pct: 22 },
      { name: '油浆 / 焦炭', pct: 18 },
    ],
  },
  {
    stage: 3,
    cn: '重整 / 加氢',
    temp: '495',
    pressure: '1.6',
    throughput: 3600,
    yieldMain: '重整汽油 92%',
    note: '三反三换，氢油比 900:1',
    products: [
      { name: '重整汽油', pct: 62 },
      { name: '歧化二甲苯', pct: 18 },
      { name: '氢气', pct: 4 },
      { name: '加氢石脑油', pct: 16 },
    ],
  },
  {
    stage: 4,
    cn: '产品调和',
    temp: '常温',
    pressure: '0.4',
    throughput: 18000,
    yieldMain: '92# 汽油 40%',
    note: '在线调和，辛烷值 / 硫含量在线分析',
    products: [
      { name: '92# 汽油', pct: 40 },
      { name: '95# 汽油', pct: 22 },
      { name: '0# 柴油', pct: 30 },
      { name: '其他组分', pct: 8 },
    ],
  },
  {
    stage: 5,
    cn: '装卸出厂',
    temp: '常温',
    pressure: '0.3',
    throughput: 18000,
    yieldMain: '装车 92%',
    note: '鹤管定量装车，单车 30 t，地衡出厂',
    products: [
      { name: '汽油出厂', pct: 62 },
      { name: '柴油出厂', pct: 30 },
      { name: '航煤出厂', pct: 6 },
      { name: '损耗 / 自用', pct: 2 },
    ],
  },
];

/** 校验：每阶段物料平衡合计 100%（供 tools 与 CI 使用） */
export function validateBalance() {
  return PROCESS_PARAMS.map((p) => ({
    stage: p.stage,
    sum: +p.products.reduce((a, b) => a + b.pct, 0).toFixed(2),
  }));
}