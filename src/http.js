// Запросы к ИИ идут через сеть Chromium (electron.net.fetch): она берёт системный прокси и VPN,
// как браузер. Обычный fetch из Node их не видит и падает с «fetch failed».
// Если один способ не достучался, пробуем второй.
let netFetch = null;
try { netFetch = require('electron').net?.fetch?.bind(require('electron').net) || null; } catch { /* не Electron */ }

const isNetErr = (e) => e && e.name !== 'AbortError' && e.name !== 'TimeoutError' && /fetch failed|net::|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket|network/i.test(`${e.message} ${e.cause?.code || ''}`);

async function fetchAI(url, opts = {}) {
  // связь иногда рвётся на секунду: третья попытка после короткой паузы
  const ways = netFetch ? [netFetch, globalThis.fetch, netFetch] : [globalThis.fetch, globalThis.fetch];
  let last;
  for (const [i, f] of ways.entries()) {
    if (i === ways.length - 1) await new Promise((r) => setTimeout(r, 900));
    try {
      return await f(url, opts);
    } catch (e) {
      last = e;
      if (!isNetErr(e)) throw e;
    }
  }
  throw Object.assign(new Error(last?.message || 'network'), { network: true, cause: last });
}

// Бесплатный Groq ограничивает число слов в минуту (снимок экрана ~2700). На 429 ждём,
// сколько просит сервис (до 25 с), и пробуем ещё раз, чтобы человек не видел ошибку.
let onWait = () => {};
const setOnWait = (fn) => { onWait = fn; };
async function fetchAIRetry(url, opts = {}) {
  let res = await fetchAI(url, opts);
  for (let i = 0; i < 2 && res.status === 429; i++) {
    let wait = Number(res.headers.get('retry-after')) || 0;
    if (!wait) {
      try { wait = Number((await res.clone().text()).match(/try again in ([\d.]+)\s*s/i)?.[1]) || 0; } catch { /* пусто */ }
    }
    wait = Math.ceil(wait || 10);
    if (wait > 25) break;
    onWait(wait);
    await new Promise((r) => setTimeout(r, wait * 1000 + 300));
    res = await fetchAI(url, opts);
  }
  return res;
}

module.exports = { fetchAI, fetchAIRetry, isNetErr, setOnWait };
