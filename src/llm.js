// Чат Пуша: Claude (Messages API), любой сервис, совместимый с OpenAI (Groq, OpenRouter, LM Studio…),
// или локальная Ollama. Claude и Ollama ещё умеют вызывать инструменты (напоминания).

const { fetchAI, fetchAIRetry } = require('./http');
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';

// Готовые настройки для OpenAI-совместимых сервисов: команде достаточно вписать ключ в team.json.
const OPENAI_PRESETS = {
  // Проверено на ключе команды 25.10.2026: gpt-oss-120b лучше пишет по-русски, но не видит картинки;
  // qwen3.8-27b понимает снимки экрана и JSON
  groq: { url: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', vision: 'qwen/qwen3.8-27b' },
  openrouter: { url: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', vision: 'qwen/qwen2.5-vl-72b-instruct:free' },
};
// provider: claude | ollama | openai | groq | openrouter → { kind, url, model, vision }
function resolve(s) {
  const p = s.provider || 'claude';
  if (p === 'claude' || p === 'ollama') return { kind: p };
  const pre = OPENAI_PRESETS[p] || {};
  const url = (s.aiUrl || pre.url || OPENAI_PRESETS.groq.url).replace(/\/+$/, '');
  const claudeModel = /^claude-/.test(s.model || '');
  return { kind: 'openai', url, model: (!claudeModel && s.model) || pre.model || OPENAI_PRESETS.groq.model, vision: s.visionModel || pre.vision || OPENAI_PRESETS.groq.vision };
}

// Сервисы меняют список моделей. Если нужной нет, берём подходящую из того, что есть у ключа.
const CHAT_PREFS = [/gpt-oss-120b/, /qwen3/, /gpt-oss/, /llama-3\.3-70b/, /llama/];
const VISION_PREFS = [/qwen3/, /llama-4/, /vl|vision/i];
const modelCache = new Map();
async function listModels(url, apiKey) {
  if (modelCache.has(url)) return modelCache.get(url);
  try {
    const res = await fetchAI(`${url}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) });
    const ids = res.ok ? ((await res.json()).data || []).map((m) => m.id).filter((id) => !/whisper|tts|orpheus|guard|embed/i.test(id)) : null;
    if (ids) modelCache.set(url, ids);
    return ids;
  } catch {
    return null;
  }
}
async function pickModel({ url, apiKey, want, vision }) {
  const ids = await listModels(url, apiKey);
  if (!ids || !ids.length || ids.includes(want)) return want;
  for (const re of vision ? VISION_PREFS : CHAT_PREFS) {
    const hit = ids.find((id) => re.test(id));
    if (hit) return hit;
  }
  return vision ? want : ids[0];
}
// gpt-oss сначала «думает», и на короткий лимит ответа не остаётся: просим думать поменьше
const extraFor = (model) => (/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {});
const cleanReply = (txt) => String(txt || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '')
  .replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '').trim(); // окошко не показывает разметку

const TOOLS = [
  {
    name: 'set_reminder',
    description: 'Set a reminder for the user in the given number of minutes.',
    schema: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'In how many minutes to remind' },
        text: { type: 'string', description: 'Reminder text' },
      },
      required: ['minutes', 'text'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List active reminders and focus sessions.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a reminder by id (get ids from list_reminders).',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'start_focus',
    description: 'Start a focus (pomodoro) session for the given number of minutes.',
    schema: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
  },
  {
    name: 'get_calendar_events',
    description: "Get the user's Google Calendar events for the next N days (default 1 = today).",
    schema: { type: 'object', properties: { days: { type: 'number' } } },
  },
];

function systemPrompt({ userName, lang }) {
  const locale = lang === 'en' ? 'en-US' : 'ru-RU';
  const now = new Date().toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });
  const ru = [
    'Ты Пушик, добрый пиксельный кот.',
    'Ты живёшь на рабочем столе и помогаешь человеку, который только знакомится с компьютером.',
    'Объясняй очень просто, без компьютерных терминов, по одному действию за раз. Описывай, где что на экране и как выглядит.',
    'Никогда не проси пароли, номера карт и коды из СМС. Если что-то похоже на обман, предупреди.',
    'Отвечай коротко и тепло, по-русски, если человек не пишет на другом языке.',
    'Иногда можно вставить «мяу» или «мур», но без перебора. Ответ показывается в маленьком окошке,',
    'поэтому избегай длинных простыней текста. Не используй разметку: ни звёздочек, ни решёток, ни таблиц.',
    userName ? `Пользователя зовут ${userName}.` : '',
    `Сейчас: ${now}.`,
  ];
  const en = [
    'You are Pushik, a kind pixel cat.',
    'You live on the desktop and help a person who is just getting to know the computer.',
    'Explain very simply, without computer jargon, one action at a time. Never ask for passwords, card numbers or SMS codes.',
    'Answer briefly and kindly, in English unless the user writes in another language.',
    'You may add a "meow" or "purr" now and then, but not too often. Replies are shown in a small window,',
    'so avoid long walls of text and complex formatting.',
    userName ? `The user's name is ${userName}.` : '',
    `Now: ${now}.`,
  ];
  return (lang === 'en' ? en : ru).filter(Boolean).join(' ');
}

async function runTool(tools, name, input) {
  try {
    return tools[name] ? String(await tools[name](input || {})) : 'Unknown tool';
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

async function readError(res) {
  let msg = `HTTP ${res.status}`;
  try {
    const j = await res.json();
    msg = j.error?.message || j.error || msg;
  } catch { /* пусто */ }
  return new Error(msg);
}

// ---------- Claude ----------
async function askClaude({ apiKey, model, history, text, tools, system }) {
  const messages = [...history, { role: 'user', content: text }];
  const actions = [];
  const defs = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));

  for (let step = 0; step < 6; step++) {
    const res = await fetchAI(CLAUDE_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1024, system, tools: defs, messages }),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    messages.push({ role: 'assistant', content: data.content });

    const uses = data.content.filter((b) => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || uses.length === 0) {
      return { reply: data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(), actions };
    }
    const results = [];
    for (const u of uses) {
      actions.push(u.name);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: await runTool(tools, u.name, u.input) });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('too many steps');
}

// ---------- OpenAI-совместимые (Groq, OpenRouter, …) ----------
async function askOpenAI({ apiKey, url, model, history, text, system }) {
  const use = await pickModel({ url, apiKey, want: model });
  const res = await fetchAIRetry(`${url}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: use, max_tokens: 1500, ...extraFor(use), messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: text }] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  return { reply: cleanReply(data.choices?.[0]?.message?.content), actions: [] };
}

// ---------- Ollama ----------
async function askOllama({ ollamaUrl, ollamaModel, history, text, tools, system }) {
  const base = ollamaUrl.replace(/\/+$/, '');
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: text }];
  const actions = [];
  let defs = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));

  for (let step = 0; step < 6; step++) {
    let res;
    try {
      res = await fetchAI(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: ollamaModel, messages, tools: defs.length ? defs : undefined, stream: false }),
      });
    } catch {
      const e = new Error('offline');
      e.offline = true;
      throw e;
    }
    if (!res.ok) {
      const err = await readError(res);
      // модель без поддержки инструментов: просто болтаем без них
      if (defs.length && /does not support tools/i.test(err.message)) { defs = []; continue; }
      throw err;
    }
    const msg = (await res.json()).message || {};
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      return { reply: String(msg.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), actions };
    }
    for (const c of calls) {
      const name = c.function?.name;
      let args = c.function?.arguments || {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      actions.push(name);
      messages.push({ role: 'tool', tool_name: name, content: await runTool(tools, name, args) });
    }
  }
  throw new Error('too many steps');
}

// Список скачанных моделей Ollama (для подсказки в настройках). null = не отвечает.
async function ollamaModels(url) {
  try {
    const res = await fetchAI(`${url.replace(/\/+$/, '')}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return ((await res.json()).models || []).map((m) => m.name);
  } catch {
    return null;
  }
}

/**
 * history: только текстовые реплики [{role, content: string}], чтобы её было легко обрезать.
 * Вызовы инструментов живут внутри одного запроса.
 */
async function ask(opts) {
  const system = systemPrompt(opts);
  const r = resolve(opts);
  const fn = r.kind === 'ollama' ? askOllama : r.kind === 'openai' ? askOpenAI : askClaude;
  const { reply, actions } = await fn({ ...opts, ...(r.kind === 'openai' ? { url: r.url, model: r.model } : {}), system });
  const text = reply || (opts.lang === 'en' ? 'Purr!' : 'Мур!');
  return {
    reply: text,
    actions,
    history: [...opts.history, { role: 'user', content: opts.text }, { role: 'assistant', content: text }],
  };
}

module.exports = { ask, ollamaModels, systemPrompt, resolve, OPENAI_PRESETS, pickModel, extraFor, cleanReply };
