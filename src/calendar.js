// Google Календарь через секретный iCal-адрес: только чтение, без входа в аккаунт.
// Раз в 10 минут скачиваем календарь, за N минут до встречи зовём кота.

const ical = require('node-ical');

const REFRESH_MS = 10 * 60_000;
const DAY = 24 * 60 * 60_000;

let url = '';
let events = [];          // [{id, title, start, end, allDay, location}], ближайшие 8 дней
let lastError = '';
let refreshTimer = null;
let checkTimer = null;
const warned = new Set();

function normalizeUrl(u) {
  return String(u || '').trim().replace(/^webcal:\/\//i, 'https://');
}

async function refresh() {
  if (!url) { events = []; lastError = ''; return; }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = ical.sync.parseICS(await res.text());
    const from = new Date(Date.now() - DAY);
    const to = new Date(Date.now() + 8 * DAY);
    const list = [];
    for (const e of Object.values(data)) {
      if (e.type !== 'VEVENT' || e.status === 'CANCELLED') continue;
      for (const i of ical.expandRecurringEvent(e, { from, to, expandOngoing: true })) {
        const start = new Date(i.start);
        const end = new Date(i.end || i.start);
        const title = typeof i.summary === 'object' ? i.summary.val : i.summary;
        list.push({
          id: `${e.uid}@${start.getTime()}`,
          title: String(title || '—'),
          start: start.getTime(),
          end: end.getTime(),
          allDay: !!i.isFullDay,
          location: typeof e.location === 'object' ? e.location?.val : e.location || '',
        });
      }
    }
    events = list.sort((a, b) => a.start - b.start);
    lastError = '';
  } catch (err) {
    lastError = err.message;
  }
}

// События, которые идут или начнутся в ближайшие `days` дней (1 = до конца завтрашнего утра не нужно, только сегодня).
function upcoming(days = 1) {
  const now = Date.now();
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const until = end.getTime() + Math.max(1, days) * DAY;
  return events.filter((e) => e.end > now && e.start < until);
}

/**
 * start({url, before, onSoon}) — включить или перенастроить календарь.
 * onSoon(event, minutesLeft) вызывается один раз для каждой встречи за `before` минут.
 */
function start({ url: u, before = 10, onSoon }) {
  url = normalizeUrl(u);
  clearInterval(refreshTimer);
  clearInterval(checkTimer);
  if (!url) { events = []; lastError = ''; return Promise.resolve(); }
  refreshTimer = setInterval(refresh, REFRESH_MS);
  checkTimer = setInterval(() => {
    const now = Date.now();
    for (const e of events) {
      if (e.allDay || warned.has(e.id)) continue;
      const left = (e.start - now) / 60_000;
      if (left <= before && left > -1) {
        warned.add(e.id);
        onSoon(e, Math.max(0, Math.round(left)));
      }
    }
  }, 20_000);
  return refresh();
}

module.exports = {
  start,
  refresh,
  upcoming,
  status: () => ({ connected: !!url, error: lastError }),
};
