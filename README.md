# 曼城转会情报站 City Transfer Hub

按「曼城转会窗媒体可信度指南 2026 版」分级（T0 树上等 / T1 权威 / T2 流量 / ITK），自动聚合各媒体、记者在 X 和官网发布的曼城转会新闻。GitHub Actions 每 ~10 分钟抓取一次，发布到 GitHub Pages，支持中文 AI 翻译。

```
GitHub Actions (每10分钟)
 ├─ RSSHub 容器(临时) ── 抓 20 个记者 X 时间线（需 TWITTER_AUTH_TOKEN）
 ├─ 官方 RSS ─────────── BBC曼城页 / 卫报曼城 / 曼晚 / 天空 / 邮报 / RMC / Teamtalk
 ├─ Google News ──────── 泰晤士报 / 电讯报 / TA / 队报 / 图片报 / 塞尔 / 奥莱 / 球报…
 ├─ 过滤(曼城词+转会词) → 去重折叠 → 分级标注 → DeepSeek 翻译(仅新增)
 └─ 发布 static/ + data/*.json → GitHub Pages
```

## 一次性配置（仓库 Settings → Secrets and variables → Actions → New repository secret）

| Secret | 作用 | 怎么拿 |
|---|---|---|
| `TWITTER_AUTH_TOKEN` | 启用**推文通道**（20 个记者 X 时间线）。不配则只有文章通道 | 用 X **小号**登录 x.com → 按 F12 → Application → Cookies → `https://x.com` → 复制 `auth_token` 的值（32位十六进制）。**别用主号**，有极低概率被限流 |
| `DEEPSEEK_API_KEY` | 启用中文翻译。不配则只显示原文 | [platform.deepseek.com](https://platform.deepseek.com) 注册 → 充 ¥10 够用几个月 → API Keys 新建 |

配好后到 Actions 页签手动跑一次 `fetch-and-deploy`（Run workflow），或等下一个整点周期。

**cookie 过期怎么办**：网页右上角 📡 面板里推特源全部变红 = cookie 失效。重新登录 X 复制新的 `auth_token`，更新 Secret 即可，代码不用动。

## 日常维护：只改 `config/sources.yaml`

- **加/删信源、改分级**：照着现有条目格式写即可，三种类型：
  - `type: twitter` + `handle:`（X 用户名，不带 @）
  - `type: rss` + `url:`（官方 RSS 地址）
  - `type: gnews` + `site:`（站内检索，付费墙媒体也能拿到标题）+ `locale:`（外语媒体必填：de/es/es-419/it/fr/pt-PT/en-US）
- **加 ITK**：在文件末尾 ITK 区块照抄一条，`tier: ITK`
- **热门球员名单** `hot_players`：转会窗期间把绯闻对象名字加进去，命中名字的新闻直接视为曼城相关（例如 `- "Florian Wirtz"`）
- **filter 字段**：`city+transfer`（综合源）/ `city`（记者个人号）/ `transfer`（曼城专属频道）/ `none`（全收）

### 信源对照备注

- **紫板** = X 独立记者 [@PurplePanel](https://x.com/PurplePanel)（英超转会与财务），已收录 T1
- **Sam C**：原图未给出具体账号，暂不收录（确认后照 twitter 模板加一条即可）
- **太阳报 Martin Blackburn**：真实 handle 为 `SunMartinB`（已核实）
- **球报**：按葡萄牙 A Bola 配置（abola.pt）

## 本地运行（开发/调试）

```powershell
npm install
npm run fetch   # 抓取 → data/items.json（自动探测本地 Clash 代理 127.0.0.1:7897）
npm run serve   # 打开 http://localhost:8787 预览
```

- 代理不在 7897？设置环境变量 `PROXY_URL=http://127.0.0.1:端口` 再跑
- 本地测推文通道：`RSSHUB_URL=你的RSSHub地址 npm run fetch`
- 本地测翻译：`DEEPSEEK_API_KEY=sk-xxx npm run fetch`

## 常见问题

- **更新频率**：cron 设的 10 分钟，GitHub 高峰期实际 10~25 分钟一次，属正常
- **国内访问**：github.io 需要科学上网；手机开代理即可访问
- **翻译成本**：DeepSeek 只翻新增条目（每次运行通常 0~20 条），每月约 ¥1~5
- **某个源一直红**：点开 📡 面板看报错；RSS 源可能换了地址，gnews 源偶发 429 下轮自愈
- **想立刻刷新**：Actions 页签 → fetch-and-deploy → Run workflow

## 数据与版权

内容来自各媒体公开发布，标题/推文归原作者，本站仅作个人聚合阅读并附原文链接。分级参考：物述有栖official@懂球帝。
