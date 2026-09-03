import { request, Agent } from 'undici';

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';
const EDGE_AUTH_API = 'https://edge.microsoft.com/translate/auth';
const EDGE_TRANSLATE_API = 'https://api-edge.cognitive.microsofttranslator.com/translate';
const MAX_PER_RUN = 300;
const BATCH = 15;
const RETRIES = 3;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(label, operation, attempts = RETRIES, signal) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
      if (attempt < attempts) await wait(800 * attempt);
    }
  }
  throw new Error(`${label}: ${lastError?.message || lastError}`);
}

async function callDeepSeek(key, texts, signal) {
  const numbered = texts.map((text, index) => (
    `${index + 1}. ${String(text).replace(/\n/g, ' ')}`
  )).join('\n');
  const body = JSON.stringify({
    model: 'deepseek-chat',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          '你是足球新闻翻译。把每条英文或其他外语动态翻成自然流畅的中文；' +
          '球员、教练和俱乐部使用通行译名；保留 here we go、金额、标签、# 和 @；' +
          '语气简洁，像中文体育媒体。输出 JSON 对象，键为条目序号字符串，' +
          '值为译文，例如 {"1":"...","2":"..."}。',
      },
      { role: 'user', content: numbered },
    ],
  });
  const response = await request(DEEPSEEK_API, {
    signal,
    method: 'POST',
    dispatcher: new Agent(),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body,
    headersTimeout: 90000,
    bodyTimeout: 90000,
  });
  const json = await response.body.json();
  if (response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(json).slice(0, 240)}`);
  }
  return JSON.parse(json.choices?.[0]?.message?.content || '{}');
}

export function edgeResponseToMap(rows) {
  const map = {};
  if (!Array.isArray(rows)) return map;
  rows.forEach((row, index) => {
    const text = row?.translations?.[0]?.text;
    if (typeof text === 'string' && text.trim()) map[String(index + 1)] = text.trim();
  });
  return map;
}

async function callEdgeTranslator(texts, signal) {
  const tokenResponse = await request(EDGE_AUTH_API, {
    signal,
    method: 'GET',
    dispatcher: new Agent(),
    headers: {
      accept: 'text/plain',
      'user-agent': 'Mozilla/5.0',
    },
    headersTimeout: 30000,
    bodyTimeout: 30000,
  });
  const token = String(await tokenResponse.body.text()).trim();
  if (tokenResponse.statusCode >= 400 || !token) {
    throw new Error(`auth HTTP ${tokenResponse.statusCode}`);
  }

  const response = await request(`${EDGE_TRANSLATE_API}?api-version=3.0&to=zh-Hans`, {
    signal,
    method: 'POST',
    dispatcher: new Agent(),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(texts.map((text) => ({ Text: String(text) }))),
    headersTimeout: 60000,
    bodyTimeout: 60000,
  });
  const json = await response.body.json();
  if (response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}: ${JSON.stringify(json).slice(0, 240)}`);
  }
  return edgeResponseToMap(json);
}

function applyMap(items, map) {
  let done = 0;
  items.forEach((item, index) => {
    const translated = map[String(index + 1)];
    if (typeof translated === 'string' && translated.trim()) {
      item.text_zh = translated.trim();
      done += 1;
    }
  });
  return done;
}

export async function translateNew(items, deepSeekKey, { signal } = {}) {
  const todo = items.filter((item) => !item.text_zh && item.text).slice(0, MAX_PER_RUN);
  let translated = 0;
  let fallbackTranslated = 0;

  for (let index = 0; index < todo.length; index += BATCH) {
    if (signal?.aborted) break;
    const batch = todo.slice(index, index + BATCH);
    const texts = batch.map((item) => item.text);
    let deepSeekMap = {};

    if (deepSeekKey) {
      try {
        deepSeekMap = await withRetry(
          'DeepSeek',
          () => callDeepSeek(deepSeekKey, texts, signal),
          RETRIES, signal,
        );
      } catch (error) {
        console.warn(`[translate] DeepSeek 批次失败，切换备用翻译：${error.message}`);
      }
    } else {
      console.warn('[translate] 未配置 DeepSeek，使用备用翻译');
    }

    translated += applyMap(batch, deepSeekMap);
    const missing = batch.filter((item) => !item.text_zh);
    if (!missing.length) continue;
    if (signal?.aborted) break;

    try {
      const fallbackMap = await withRetry(
        'Edge translator',
        () => callEdgeTranslator(missing.map((item) => item.text), signal),
        RETRIES, signal,
      );
      const count = applyMap(missing, fallbackMap);
      translated += count;
      fallbackTranslated += count;
    } catch (error) {
      console.warn(`[translate] 备用翻译批次失败：${error.message}`);
    }
  }

  const remaining = items.filter((item) => !item.text_zh && item.text).length;
  return {
    translated,
    fallbackTranslated,
    remaining,
    limited: remaining > 0 && todo.length >= MAX_PER_RUN,
  };
}
