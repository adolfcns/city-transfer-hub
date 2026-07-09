// DeepSeek 批量翻译：仅翻新增条目，失败不阻塞主流程
// 直连不走代理（DeepSeek 国内可直达）
import { request, Agent } from 'undici';

const API = 'https://api.deepseek.com/chat/completions';
const MAX_PER_RUN = 60;   // 单次运行翻译上限（成本保险丝）
const BATCH = 15;

async function callDeepSeek(key, texts) {
  const numbered = texts.map((t, i) => `${i + 1}. ${t.replace(/\n/g, ' ')}`).join('\n');
  const body = JSON.stringify({
    model: 'deepseek-chat',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          '你是足球转会新闻翻译。把每条英文/外语新闻翻成自然流畅的中文：保留球员/教练/俱乐部人名可用通行中文译名；' +
          '"here we go" 保留英文原文；金额、标签(#/@)原样保留；语气简洁像体育媒体。' +
          '输出 JSON 对象，键为条目序号字符串，值为译文，如 {"1":"...","2":"..."}',
      },
      { role: 'user', content: numbered },
    ],
  });
  const res = await request(API, {
    method: 'POST',
    dispatcher: new Agent(),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body,
    headersTimeout: 90000,
    bodyTimeout: 90000,
  });
  const json = await res.body.json();
  if (res.statusCode >= 400) throw new Error(`DeepSeek HTTP ${res.statusCode}: ${JSON.stringify(json).slice(0, 200)}`);
  const content = json.choices?.[0]?.message?.content || '{}';
  return JSON.parse(content);
}

/** 就地填充 item.text_zh，返回翻译条数 */
export async function translateNew(items, key) {
  if (!key) return 0;
  const todo = items.filter((it) => !it.text_zh && it.text).slice(0, MAX_PER_RUN);
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const map = await callDeepSeek(key, batch.map((it) => it.text));
      batch.forEach((it, j) => {
        const zh = map[String(j + 1)];
        if (typeof zh === 'string' && zh.trim()) { it.text_zh = zh.trim(); done++; }
      });
    } catch (e) {
      console.warn(`[translate] 批次失败（跳过）: ${e.message}`);
    }
  }
  return done;
}
