// 触发代理（Cloudflare Worker）
// 作用：网页访客点 ⚡ → 请求本 Worker → Worker 用藏在服务端的令牌触发 GitHub 抓取任务。
// 令牌永不暴露给访客。
//
// 部署步骤（免费）：
//   1. dash.cloudflare.com 注册/登录 → Workers & Pages → Create → Create Worker → Deploy
//   2. Edit code → 清空默认代码 → 粘贴本文件全部内容 → Deploy
//   3. Worker 页面 → Settings → Variables and Secrets → Add：
//        Type: Secret   Name: GH_PAT   Value: （fine-grained 令牌，只授本仓库 Actions 读写）
//   4. 把 Worker 地址（https://xxx.workers.dev）填进 static/app.js 的 TRIGGER_ENDPOINT

const REPO = 'adolfcns/city-transfer-hub';
const WORKFLOW = 'fetch.yml';
const ALLOW_ORIGIN = 'https://adolfcns.github.io'; // 只允许本站网页调用
const COOLDOWN_SECONDS = 90;                        // 全局冷却，防止被刷

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'content-type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, reason: 'use POST' }), { status: 405, headers: cors });
    }

    // 冷却检查（按数据中心粒度，够用）
    const cache = caches.default;
    const gate = new Request('https://cooldown.internal/last');
    if (await cache.match(gate)) {
      return new Response(JSON.stringify({ ok: false, reason: 'cooldown' }), { status: 429, headers: cors });
    }

    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GH_PAT}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'city-transfer-hub-trigger', // GitHub API 必需
      },
      body: JSON.stringify({ ref: 'main' }),
    });

    if (res.status === 204) {
      await cache.put(gate, new Response('1', { headers: { 'cache-control': `max-age=${COOLDOWN_SECONDS}` } }));
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }
    return new Response(JSON.stringify({ ok: false, status: res.status }), { status: 502, headers: cors });
  },
};
