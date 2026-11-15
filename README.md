# 霓虹灯牌设计预览系统

浏览器内完成霓虹灯牌从文字 / SVG 到灯管路径、夜景效果、报价单的全流程设计工具。
React 18 + TypeScript + three.js + Vite，纯前端运行，订单数据保存在浏览器，可导出 / 导入 JSON。

## 启动

```bash
npm install
npm run dev        # 开发
npm run build      # 生产构建
npm run test:algo # 排管算法单元测试（29 项）
npm run typecheck  # 类型检查
```

轮廓追踪另有 `test/contour.test.ts`（11 项），可通过 esbuild 打包后在 Node 运行。

## 五个页面

| 页面 | 功能 |
| --- | --- |
| 订单列表 | 订单增删改、复制、重命名、单个 / 全部导出、JSON 导入 |
| 灯管排线 | 文字（含上传 TTF/OTF）或 SVG 输入，自动沿笔画 / 轮廓排管，几何校验与一键修复，逐段配色、管径、接触不良设置 |
| 背板材质 | 亚克力 / 金属（拉丝）/ 木纹（程序化贴图），尺寸、板厚、底色、墙面颜色与离墙距离 |
| 夜景预览 | 常亮 / 闪烁 / 流水 / 接触不良动画，UnrealBloom 辉光，FPS 监测与自动降质，带参数截图，电气估算与报价单 |
| 设置 | 默认工艺、报价单价、变压器参数、税率、数据管理 |

## 排管算法管线

```
文字/SVG 栅格化（白底深色字，按亮度取笔画掩码）
  ├─ 文字 / 中轴模式：Zhang-Suen 细化 → 交叉点聚类 → 方向连续性追踪 → 短枝修剪 → 直通配对
  └─ SVG 轮廓模式：Moore-Neighbor 边界追踪 → RDP 抽稀（实心 logo 沿外轮廓走闭合管）
坐标映射到背板毫米 → 去重 → removeSelfLoops 去环（不自交兜底）
  → 相切圆弧圆角（弯管最小半径，空间不足自动降级）→ 再次去环
  → 几何校验（自交 / 半径 / 越界=错误，间距=工艺提示）
```

### 三项硬性要求如何保证

- **路径不自交**：交叉点按“最直通走向”配对；最终每条折线经 `removeSelfLoops` 几何兜底，
  检测到线段真正相交即删除回环，校验面板对自交零容忍报错。
- **弯管半径不小于设定值**：`roundCorners` 在每个转角用与两侧直线相切的圆弧，
  半径取目标值与几何可达上限的较小者；窄角自动降级并在校验面板给出可一键接受的提示。
- **旋转辉光不闪不糊、60fps**：动画时间由渲染时钟累计驱动（与相机解耦，旋转不重启动画）；
  辉光走 UnrealBloom 离屏后处理，分辨率随容器稳定；自动模式连续低于 50fps 自动降低像素比。

## 数据存储

- 订单（含灯管点数据，可能较大）存 **IndexedDB**，避免 localStorage 配额问题；首次启动自动迁移旧 localStorage 数据。
- 设置与当前订单 id 存 localStorage；自定义字体存 IndexedDB 并通过 FontFace 注册。
- 订单可导出为 JSON 备份或换机导入。

## 关键目录

```
src/core/        thinning(细化) skeleton(骨架提取) contour(轮廓追踪)
                 geometry(几何/圆角/去环/校验) pipeline(主管线) quote(报价) rasterize(栅格化)
src/engine/      NeonEngine(渲染器/后处理/动画时钟) tube board materials spill
src/store/       zustand 订单 / 设置 / 字体 store
src/pages/       五个页面
src/components/  Viewer3D SourcePanel RunPanel QuoteModal screenshot 等
test/            Node 算法测试
```
