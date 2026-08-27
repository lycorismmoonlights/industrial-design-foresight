# 来源管理第三版 Design QA

## 对照目标

- Source visual truth: `C:\Users\mz\.codex\generated_images\01a0411d-db27-7780-8af4-4c327c3f7339\exec-bbc4b8dc-1869-4d03-8ed1-1d6bf6ed0754.png`
- Rendered implementation: `C:\Users\mz\AppData\Local\Temp\source-management-option3-final-fred.png`
- Mobile evidence: `C:\Users\mz\AppData\Local\Temp\source-management-option3-mobile-390x844.png`
- State: 来源管理主从视图，FRED Economic Data 处于“需要处理”，显示缺少 `FRED_API_KEY`、修复入口与最近失败记录。
- Desktop viewport: 1440 × 1024 CSS px，device scale 1；实现截图为 1440 × 1024 px。
- Source pixels: 1487 × 1058 px，与 1440 × 1024 同宽高比；按 0.9684 比例归一化为 1440 × 1024 进行构图对照。
- Mobile check: 浏览器设置为 390 × 844 CSS px；浏览器截图内容为 375 × 812 px，文档宽度等于 client width 375 px，无横向溢出。

## 全视图对照证据

参考图与最终实现已在同一比较输入中打开。实现保留了现有产品的完整文字侧栏和顶部“新增记录”入口，这是既有应用壳层约束；来源工作区内部遵循第三版结构：左侧搜索/筛选/来源列表，右侧来源身份、状态概览、连接诊断、直接操作和运行记录。区域比例、白色工作面、浅绿选中态、低阴影和松散垂直节奏与参考图一致。

未单独裁切 focused region：1440 × 1024 全视图中来源名称、状态、诊断、按钮和运行行均可辨认；添加、编辑和运行时密钥弹窗另以真实交互和 DOM 可见性验证，参考图没有对应弹窗状态，强行做局部像素对照会制造错误精度。

## 必查表面

- Fonts and typography: 沿用项目 Inter / PingFang SC / Microsoft YaHei 字体栈；第二轮提高来源列表、状态、详情字段和诊断说明字号，层级与参考图接近，长名称在手机端可正常换行。
- Spacing and layout rhythm: 工作区桌面为 34% / 66% 主从分栏，移动端改为上下堆叠；标题、诊断、动作区和运行区边界清楚，无重叠或横向滚动。
- Colors and visual tokens: 继续使用项目 pine、mint、amber、coral 与灰阶 token；待测试为琥珀、异常为珊瑚、正常为绿色，语义一致。
- Image quality and assets: 页面没有参考图要求的照片或插画；全部功能图标来自既有 Lucide 图标库，没有占位图、手工 SVG 或 CSS 插画替代。
- Copy and content: 页面说明改为用户任务语言；添加方式按推荐、RSS、官方 API、普通网页分流；密钥明确只放运行时，未把 JSON 或密钥暴露为默认操作。
- Accessibility and interaction: 搜索、筛选、来源选择、添加 tabs、编辑、启用确认、测试、密钥帮助均使用语义控件；选中来源有可见 focus 样式；390 px 下无横向溢出。

## 比较历史

### Iteration 1 — blocked

- [P1] 从未运行的来源被诊断卡误报为“最近一次抓取成功”。
- [P2] 来源列表、状态与详情字段字号偏小，和参考图的可扫描性有明显差距。
- Evidence: `C:\Users\mz\AppData\Local\Temp\source-management-option3-before.png`（1265 × 712 px，浏览器默认视口）。

Fixes:

- 新增独立“尚未完成连接测试”状态，只有存在 `lastSuccessAt` 时才展示成功诊断。
- 提高来源列表、筛选、状态、详情定义、诊断说明和运行记录字号；补充明确的 focus-visible 样式。
- 失败抓取也会刷新来源和运行概览，错误诊断不再依赖手动刷新页面。
- 后台刷新不再因“研究记录为空”而卸载整个页面，当前来源选择和编辑上下文得以保留。
- 用本地测试数据完成 FRED 缺少运行时密钥的真实失败状态，使最终实现与参考图处于同一核心任务状态。

### Iteration 2 — passed

- Post-fix evidence: `C:\Users\mz\AppData\Local\Temp\source-management-option3-final-fred.png`（1440 × 1024 px）。
- No actionable P0/P1/P2 findings remain.
- 可接受差异：现有产品的 246 px 文字侧栏替代参考图的窄图标栏；这是为保持全站导航一致性而保留的产品约束，不影响来源工作区的信息结构。

## 浏览器验证

- 主流程：添加推荐来源、添加官方 API 来源、搜索、全部/需处理/已停用筛选、来源选择与详情联动。
- 配置流：RSS 添加表单、官方 API 友好字段、共享编辑器、高级参数折叠区、启用确认。
- 故障流：FRED 缺少密钥测试、失败状态持久化、最近运行记录、`FRED_API_KEY` 运行时帮助。
- 响应式：1440 × 1024 桌面与 390 × 844 手机设置；手机端文档无横向溢出。
- Console errors: 0。

## Follow-up polish

- [P3] 如果以后统一重做全站壳层，可再评估把桌面文字侧栏压缩为窄图标栏；本次不扩大改动范围。

final result: passed
