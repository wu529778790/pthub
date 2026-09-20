# 开放注册 PT 站点

收录当前开放注册的 PT 站点，由 GitHub Actions 每日自动探测注册入口状态并发布到 GitHub Pages。

## 特性

- **数据与视图分离**：站点清单是纯 JSON，页面只负责渲染，改数据不用碰代码
- **每日自动探测**：定时抓取各站点注册页，判定「开放注册 / 邀请制 / 已关闭 / 未知」
- **构建期编译**：Vite + TypeScript 打包，产物是纯静态文件，零运行时依赖
- **可测试**：状态判定与数据合并都是纯函数，有单元测试覆盖
- **自适应**：响应式布局，跟随系统深浅色

## 目录结构

```
data/
  sites.json          # 站点清单（人工维护）
  status.json         # 探测结果（由每日脚本自动生成与提交）
scripts/
  update-sites.ts     # 每日探测脚本
src/
  core/
    types.ts          # 领域类型定义
    classify.ts       # 注册页内容 -> 注册状态（纯函数）
    merge.ts          # 清单 + 探测结果 -> 视图模型（纯函数）
  ui/
    labels.ts         # 界面文案
    render.ts         # DOM 渲染与状态筛选
  styles/main.css     # 样式
  config.ts           # 站点品牌配置
  main.ts             # 应用入口
tests/                # Vitest 单元测试
```

## 本地开发

```bash
npm install
npm run dev        # 启动开发服务器
npm test           # 运行单元测试
npm run build      # 类型检查 + 生产构建，产物在 dist/
npm run preview    # 预览构建产物
```

## 维护站点清单

编辑 `data/sites.json`，新增条目：

```json
{
  "name": "站点名称",
  "domain": "example.com",
  "engine": "nexusphp",
  "registerUrl": "https://example.com/signup.php",
  "note": "可选的一句话备注"
}
```

- `domain` 必须唯一，它同时是 `data/status.json` 里的键
- `engine` 可选值：`nexusphp`、`unit3d`、`torrenttrader`、`other`
- 站点图标不需要单独配置，页面直接加载站点自身的 `/favicon.ico`，加载失败会退化成首字母方块

手动跑一次探测（会覆盖 `data/status.json`）：

```bash
npm run update:sites          # 写入状态文件
npm run update:sites -- --dry # 只看结果，不写文件
```

## 自动化流程

| 工作流 | 触发时机 | 作用 |
| --- | --- | --- |
| `.github/workflows/update-sites.yml` | 每天 UTC 23:30（北京时间 07:30） | 跑探测脚本，把结果提交回 `data/status.json` |
| `.github/workflows/deploy.yml` | push 到 `main` 且改动涉及 `src/`、`data/` 等 | 跑测试 + 构建，发布 `dist/` 到 `gh-pages` |

两个工作流串起来形成闭环：探测提交状态文件 → 触发部署 → Pages 更新。

首次部署前需要在仓库 **Settings → Pages** 里把 Source 设为 `gh-pages` 分支。

## 状态判定逻辑

`src/core/classify.ts` 依据注册页内容做启发式判定，优先级如下：

1. 网络异常或 HTTP 5xx → `unknown`
2. 页面命中「注册已关闭」等文案 → `closed`
3. 页面存在真实注册表单 → `open`
4. 页面命中「邀请码 / invite only」等文案 → `invite`
5. HTTP 404 → `closed`
6. 其余情况 → `unknown`

其中「真实注册表单」要求出现 NexusPHP 的 `wantusername` 字段，或同时出现用户名与邮箱字段——这样站点关闭注册跳转到登录页时不会被误判为开放。

需要注意 `unknown` 的语义是「探测失败或无法判定」，**不等于已关闭**，页面上单独提示，避免误导访客。站点模板差异可能导致个别误判，发现后可以调整 `classify.ts` 里的关键字表并补测试。

## 抗抖动策略

抓取远端页面必然会有偶发失败（超时、TLS 握手被掐断、站点瞬时 5xx）。如果一次失败就把站点标成「未知」，页面就会频繁误报，所以加了两层保护：

1. **单轮重试**：每个站点最多尝试 3 次（间隔 1.5s、3s），只对失败结果重试，成功立即返回。5xx 也计入失败并重试。
2. **跨轮沿用**：某一轮仍然失败时，如果该站点之前有确定的状态，就**沿用上次状态和确认时间**，只在卡片上标注「本次探测失败，状态为上次确认结果」。只有**连续失败 3 次**（即连续 3 天连不上）才真正降级为 `unknown`。

因此 `status.json` 里的 `checkedAt` 记录的是**最近一次成功**探测的时间，失败时不覆盖——卡片上显示的日期本身就是状态新鲜度的信号。`failures` 字段记录连续失败次数，成功时清零。这套逻辑集中在 `src/core/resolve.ts`，有独立测试覆盖。

## 品牌配置

站点标题、副标题、页脚署名集中在 `src/config.ts`，改一处即可全站生效。
