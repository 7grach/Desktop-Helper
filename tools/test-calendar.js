// Run with: node --test tools/test-calendar.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const calendarSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'calendar.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const remindersCode = mainSource.slice(
  mainSource.indexOf('const remindersFile'),
  mainSource.indexOf('// ---------- Окна других программ ----------'),
);
const settle = () => new Promise((resolve) => setImmediate(resolve));

function event(overrides = {}) {
  const now = Date.now();
  return {
    type: 'VEVENT',
    uid: 'event-' + Math.random().toString(36).slice(2),
    summary: 'Встреча',
    status: 'CONFIRMED',
    start: new Date(now + 60 * 60_000),
    end: new Date(now + 90 * 60_000),
    isFullDay: false,
    location: { val: 'Офис' },
    ...overrides,
  };
}

function calendarHarness({ events = {}, expand, fetchImpl } = {}) {
  const calls = { fetched: [], parsed: [], expanded: [], intervals: [], cleared: [], soon: [] };
  const ical = {
    sync: { parseICS(text) { calls.parsed.push(text); return events; } },
    expandRecurringEvent(item, options) {
      calls.expanded.push({ item, options });
      return expand ? expand(item, options) : [item];
    },
  };
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === 'node-ical') return ical;
      throw new Error(`unexpected require: ${name}`);
    },
    fetch: fetchImpl || (async (url, options) => {
      calls.fetched.push({ url, options });
      return { ok: true, text: async () => 'ICS' };
    }),
    AbortSignal,
    setInterval(callback, ms) {
      calls.intervals.push({ callback, ms });
      return calls.intervals.length;
    },
    clearInterval(id) { calls.cleared.push(id); },
    console,
  };
  vm.createContext(context);
  vm.runInContext(calendarSource, context);
  return { module: context.module.exports, calls };
}

test('calendar start normalises webcal and maps events', async () => {
  const item = event({ uid: 'call', summary: { val: 'Созвон' }, location: { val: 'Офис' } });
  const h = calendarHarness({ events: { call: item } });
  const soon = [];
  await h.module.start({ url: ' webcal://example.com/cal.ics ', before: 7, onSoon: (...args) => soon.push(args) });

  assert.equal(h.calls.fetched.length, 1);
  assert.equal(h.calls.fetched[0].url, 'https://example.com/cal.ics');
  assert.equal(h.calls.fetched[0].options.signal instanceof AbortSignal, true);
  const status = h.module.status();
  assert.equal(status.connected, true);
  assert.equal(status.error, '');

  const list = h.module.upcoming(2);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, `call@${new Date(item.start).getTime()}`);
  assert.equal(list[0].title, 'Созвон');
  assert.equal(list[0].location, 'Офис');
  assert.equal(list[0].allDay, false);
  assert.equal(h.calls.intervals.length, 2);
  assert.deepEqual(h.calls.intervals.map((item) => item.ms), [10 * 60_000, 20_000]);
});

test('calendar skips cancelled events before expanding them', async () => {
  const cancelled = event({ uid: 'cancelled', status: 'CANCELLED' });
  const ok = event({ uid: 'ok' });
  const h = calendarHarness({ events: { cancelled, ok } });
  await h.module.start({ url: 'https://example.com/cal.ics', onSoon() {} });

  const list = h.module.upcoming(2);
  assert.equal(list.length, 1);
  assert.equal(h.calls.expanded.length, 1);
  assert.equal(h.calls.expanded[0].item.uid, 'ok');
});

test('calendar expands a recurring event into separate instances', async () => {
  const base = event({ uid: 'repeat' });
  const now = Date.now();
  const instances = [
    { ...base, start: new Date(now + 60 * 60_000), end: new Date(now + 90 * 60_000) },
    { ...base, start: new Date(now + 3 * 60 * 60_000), end: new Date(now + 4 * 60 * 60_000) },
  ];
  const h = calendarHarness({ events: { repeat: base }, expand: () => instances });
  await h.module.start({ url: 'https://example.com/cal.ics', onSoon() {} });

  const list = h.module.upcoming(2);
  assert.equal(list.length, 2);
  assert.notEqual(list[0].id, list[1].id);
  assert.ok(list.every((entry) => entry.id.startsWith('repeat@')));
});

test('calendar reports HTTP and network errors without throwing', async () => {
  const http = calendarHarness({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  await http.module.start({ url: 'https://example.com/cal.ics', onSoon() {} });
  assert.equal(http.module.status().error, 'HTTP 503');

  const network = calendarHarness({ fetchImpl: async () => { throw new Error('offline'); } });
  await network.module.start({ url: 'https://example.com/cal.ics', onSoon() {} });
  assert.equal(network.module.status().error, 'offline');
  assert.equal(network.module.upcoming(2).length, 0);
});

test('calendar recovers after a failed refresh', async () => {
  let attempt = 0;
  const item = event({ uid: 'recovered' });
  const h = calendarHarness({
    events: { recovered: item },
    fetchImpl: async () => {
      attempt += 1;
      if (attempt === 1) return { ok: false, status: 500 };
      return { ok: true, text: async () => 'ICS' };
    },
  });
  await h.module.start({ url: 'https://example.com/cal.ics', onSoon() {} });
  assert.equal(h.module.status().error, 'HTTP 500');
  await h.module.refresh();
  assert.equal(h.module.status().error, '');
  assert.equal(h.module.upcoming(2).length, 1);
});

test('calendar without a URL clears events and does not call the network', async () => {
  const h = calendarHarness();
  await h.module.start({ url: '', before: 10 });
  const status = h.module.status();
  assert.equal(status.connected, false);
  assert.equal(status.error, '');
  assert.equal(h.calls.fetched.length, 0);
  assert.equal(h.calls.intervals.length, 0);
  assert.equal(h.module.upcoming(1).length, 0);
});

test('calendar reminds once about a soon event and skips all-day events', async () => {
  const now = Date.now();
  const soon = event({ uid: 'soon', start: new Date(now + 5 * 60_000), end: new Date(now + 65 * 60_000) });
  const allDay = event({ uid: 'all-day', isFullDay: true, start: new Date(now + 5 * 60_000), end: new Date(now + 65 * 60_000) });
  const h = calendarHarness({ events: { soon, allDay } });
  const warned = [];
  await h.module.start({ url: 'https://example.com/cal.ics', before: 10, onSoon: (entry, minutes) => warned.push({ entry, minutes }) });

  const check = h.calls.intervals.find((item) => item.ms === 20_000).callback;
  check();
  check();
  assert.equal(warned.length, 1);
  assert.ok(warned[0].entry.id.startsWith('soon@'));
  assert.ok(warned[0].minutes >= 4 && warned[0].minutes <= 5);
});

test('calendar upcoming keeps running events and drops past and far-away ones', async () => {
  const now = Date.now();
  const past = event({ uid: 'past', start: new Date(now - 3 * 60 * 60_000), end: new Date(now - 60 * 60_000) });
  const future = event({ uid: 'future', start: new Date(now + 60 * 60_000), end: new Date(now + 2 * 60 * 60_000) });
  const far = event({ uid: 'far', start: new Date(now + 9 * 24 * 60 * 60_000), end: new Date(now + 9 * 24 * 60 * 60_000 + 60 * 60_000) });
  const h = calendarHarness({ events: { past, future, far } });
  await h.module.start({ url: 'https://example.com/cal.ics', onSoon() {} });

  const list = h.module.upcoming(2);
  assert.equal(list.length, 1);
  assert.equal(list[0].id.startsWith('future@'), true);
});

test('calendar falls back to a dash for a missing title and keeps a string location', async () => {
  const item = event({ uid: 'plain', summary: undefined, location: 'Дом' });
  const h = calendarHarness({ events: { plain: item } });
  await h.module.start({ url: 'https://example.com/cal.ics', onSoon() {} });
  const list = h.module.upcoming(2);
  assert.equal(list[0].title, '—');
  assert.equal(list[0].location, 'Дом');
});

function remindersHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushik-calendar-test-'));
  const calls = {
    sent: [], notifications: [], shown: 0, timers: new Map(), timerSeq: 0, cleared: [], calendarStart: null,
  };
  const win = {
    showInactive() { calls.shown += 1; },
    webContents: { send(channel, data) { calls.sent.push({ channel, data }); } },
  };
  class FakeNotification {
    static isSupported() { return true; }
    constructor(options) { this.options = options; }
    show() { calls.notifications.push(this.options); }
  }
  const calendar = {
    async start(options) { calls.calendarStart = options; },
    status() { return { connected: true, error: '' }; },
    upcoming(days) { return [{ day: days }]; },
  };
  const settings = { calendarUrl: 'https://example.com/cal.ics', calendarBefore: 15 };
  const t = (key, vars = {}) => {
    if (key === 'cal.soon') return `Через ${vars.min} мин: ${vars.title}`;
    if (key === 'cal.now') return `Сейчас: ${vars.title}`;
    if (key === 'notif.calendar') return 'Календарь';
    if (key === 'notif.focus') return 'Фокус';
    if (key === 'notif.reminder') return 'Напоминание';
    if (key === 'rem.default') return 'Напоминание по умолчанию';
    return key;
  };
  const context = {
    app: { getPath: () => dir },
    path, fs, settings, calendar, win, t,
    ASSETS: 'assets',
    Notification: FakeNotification,
    setTimeout(callback, ms) {
      const id = ++calls.timerSeq;
      calls.timers.set(id, { callback, ms });
      return id;
    },
    clearTimeout(id) {
      calls.cleared.push(id);
      calls.timers.delete(id);
    },
    console,
  };
  vm.createContext(context);
  vm.runInContext(remindersCode, context);
  return { context, calls, dir };
}

function readReminders(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'reminders.json'), 'utf8'));
}

function cleanup(t, dir) {
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
}

test('addReminder stores a reminder, schedules it and persists it', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  const before = Date.now();
  const reminder = h.context.addReminder({ minutes: 5, text: 'Позвонить маме' });
  const after = Date.now();

  assert.ok(reminder.at >= before + 5 * 60_000 && reminder.at <= after + 5 * 60_000);
  assert.equal(reminder.text, 'Позвонить маме');
  assert.equal(reminder.kind, 'reminder');
  assert.equal(h.calls.timers.size, 1);
  const timer = [...h.calls.timers.values()][0];
  assert.ok(timer.ms >= 5 * 60_000 - 1_000 && timer.ms <= 5 * 60_000 + 1_000);
  assert.equal(readReminders(h.dir).length, 1);
  assert.ok(h.calls.sent.some((entry) => entry.channel === 'reminders-changed'));
});

test('addReminder falls back to the default text', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  const reminder = h.context.addReminder({ minutes: 1, text: '' });
  assert.equal(reminder.text, 'Напоминание по умолчанию');
});

test('cancelReminder clears the timer and reports whether something was removed', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  const reminder = h.context.addReminder({ minutes: 5, text: 'Позвонить' });
  assert.equal(h.context.cancelReminder(reminder.id), true);
  assert.equal(h.context.cancelReminder(reminder.id), false);
  assert.equal(h.calls.timers.size, 0);
  assert.equal(readReminders(h.dir).length, 0);
});

test('fireReminder notifies, shows the window and removes the reminder', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  const reminder = h.context.addReminder({ minutes: 5, text: 'Позвонить', kind: 'focus' });
  const timer = [...h.calls.timers.values()][0];
  timer.callback();

  assert.equal(h.calls.notifications.length, 1);
  assert.equal(h.calls.notifications[0].title, 'Фокус');
  assert.equal(h.calls.notifications[0].body, 'Позвонить');
  assert.equal(h.calls.shown, 1);
  assert.ok(h.calls.sent.some((entry) => entry.channel === 'reminder' && entry.data.id === reminder.id));
  assert.equal(readReminders(h.dir).length, 0);
});

test('scheduleReminder skips delays longer than the setTimeout limit', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  h.context.addReminder({ minutes: 60 * 24 * 30, text: 'Далеко' });
  assert.equal(h.calls.timers.size, 0);
});

test('loadReminders restores a saved reminder and schedules it', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  const at = Date.now() + 60_000;
  fs.writeFileSync(path.join(h.dir, 'reminders.json'), JSON.stringify([
    { id: 'saved', at, text: 'Созвон', kind: 'reminder' },
  ]));
  h.context.loadReminders();
  assert.equal(h.calls.timers.size, 1);
  const timer = [...h.calls.timers.values()][0];
  assert.ok(timer.ms >= 59_000 && timer.ms <= 60_000);
});

test('loadReminders tolerates a broken file', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  fs.writeFileSync(path.join(h.dir, 'reminders.json'), '{ broken');
  h.context.loadReminders();
  assert.equal(h.calls.timers.size, 0);
});

test('startCalendar passes settings and turns a soon event into a notification', async (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  h.context.startCalendar();
  await settle();

  assert.equal(h.calls.calendarStart.url, 'https://example.com/cal.ics');
  assert.equal(h.calls.calendarStart.before, 15);
  assert.ok(h.calls.sent.some((entry) => entry.channel === 'calendar-changed'));

  h.calls.calendarStart.onSoon({ title: 'Созвон' }, 0);
  assert.equal(h.calls.notifications.at(-1).body, 'Сейчас: Созвон');
  assert.ok(h.calls.sent.some((entry) => entry.channel === 'calendar-soon' && entry.data.text === 'Сейчас: Созвон'));

  h.calls.calendarStart.onSoon({ title: 'Созвон' }, 5);
  assert.equal(h.calls.notifications.at(-1).body, 'Через 5 мин: Созвон');
  assert.ok(h.calls.sent.some((entry) => entry.channel === 'calendar-soon' && entry.data.text === 'Через 5 мин: Созвон'));
});

test('calendarList merges status and upcoming events', (t) => {
  const h = remindersHarness();
  cleanup(t, h.dir);
  const result = h.context.calendarList(2);
  assert.equal(result.connected, true);
  assert.equal(result.error, '');
  assert.deepEqual(result.events.map((entry) => entry.day), [2]);
});
