// Run with: node --test tools/test-home.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { byText, makeDom } = require('./fake-dom');

const homeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'home.js'), 'utf8');

function homeHarness({ skills = [], firstSuccessCard = null, savePostcard } = {}) {
  const { document, window } = makeDom();
  const openButton = document.createElement('button');
  openButton.id = 'open-skill-home';
  document.body.append(openButton);

  const calls = { panels: [], goals: [], timers: [], lessons: [] };
  const handlers = {};
  const settings = { skills, firstSuccessCard };
  const api = { on(channel, listener) { handlers[channel] = listener; } };
  if (savePostcard !== undefined) api.savePostcard = savePostcard;

  const context = {
    window, document, settings, api,
    closePanels: () => calls.panels.push('close'),
    showPanel: (name) => calls.panels.push(name),
    lessons: () => calls.lessons,
    routeGoal: (goal) => calls.goals.push(goal),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() {}
      disconnect() {}
    },
    getComputedStyle: () => ({ fontFamily: 'Test Font' }),
    setTimeout: (callback, ms) => { calls.timers.push({ callback, ms }); return calls.timers.length; },
    clearTimeout: () => {},
  };
  vm.createContext(context);
  vm.runInContext(homeSource, context);

  return { document, window, settings, api, calls, handlers, open: () => window.PushikHome.open() };
}

test('skill home groups skills by object and counts them', () => {
  const h = homeHarness({ skills: [
    { name: 'Фото с флешки' },
    { name: 'Звонок по видео' },
    { name: 'Поиск в интернете' },
    { name: 'Мышка' },
    { name: 'Буквы крупнее' },
    { name: 'Звук громче' },
    { name: 'Неизвестный навык' },
  ] });
  h.open();
  const home = h.document.querySelector('.skill-home');
  assert.ok(home);
  const objects = home.querySelectorAll('.home-object');
  assert.equal(objects.length, 6);
  assert.deepEqual(
    objects.map((object) => object.className.match(/room-object-(\w+)/)[1]).sort(),
    ['call', 'mouse', 'photos', 'search', 'type', 'volume'],
  );
  const search = objects.find((object) => object.classList.contains('room-object-search'));
  assert.equal(search.getAttribute('aria-label'), 'Лупа исследователя: Поиск в интернете, Неизвестный навык');
  assert.equal(search.querySelector('.room-object-count').textContent, '2');
  assert.equal(home.querySelector('.room-caption').textContent, '7 открытий · 6 предметов в комнате');
});

test('empty skill home invites the first lesson', () => {
  const h = homeHarness({ skills: [] });
  h.open();
  const home = h.document.querySelector('.skill-home');
  assert.equal(home.querySelectorAll('.home-object').length, 0);
  assert.equal(home.querySelector('.home-empty').textContent, 'Комната ждёт твоих открытий. Пройди первый урок — здесь появится предмет.');
  assert.equal(home.querySelector('.room-caption').textContent, '0 открытий · 0 предметов в комнате');
});

test('repeat starts a known lesson and closes the home', () => {
  const h = homeHarness({ skills: [{ name: 'Открыть папку' }] });
  let started = 0;
  h.calls.lessons = [{ name: 'Открыть папку', start() { started += 1; } }];
  h.open();
  h.document.querySelector('.room-object-search').onclick();
  const detail = h.document.querySelector('.home-detail');
  assert.match(detail.textContent, /Ты уже освоил это действие/);
  byText(detail, 'Повторить навык').onclick();
  assert.equal(started, 1);
  assert.equal(h.document.querySelector('.skill-home'), null);
});

test('repeat without a matching lesson routes the goal again', () => {
  const h = homeHarness({ skills: [{ name: 'Найти файл' }] });
  h.open();
  h.document.querySelector('.room-object-search').onclick();
  byText(h.document.querySelector('.home-detail'), 'Повторить навык').onclick();
  assert.deepEqual(h.calls.goals, ['Найти файл']);
  assert.equal(h.document.querySelector('.skill-home'), null);
});

test('a studied element is shown without a repeat button', () => {
  const h = homeHarness({ skills: [{ name: 'Изучено: Кнопка Пуск' }] });
  h.open();
  h.document.querySelector('.room-object-search').onclick();
  const detail = h.document.querySelector('.home-detail');
  assert.match(detail.textContent, /Ты познакомился с этим элементом/);
  assert.equal(byText(detail, 'Повторить навык'), null);
});

test('back returns from the skill home to the lessons panel', () => {
  const h = homeHarness({ skills: [] });
  h.open();
  h.document.querySelector('.home-back').onclick();
  assert.equal(h.document.querySelector('.skill-home'), null);
  assert.equal(h.calls.panels.at(-1), 'lessons');
});

test('postcard draws the first success and saves it through the API', async () => {
  const h = homeHarness({ skills: [], savePostcard: async () => ({ saved: true }) });
  h.window.PushikHome.showPostcard({ name: 'Самостоятельно: Открыть папку', at: Date.UTC(2026, 10, 10, 12) });
  const postcard = h.document.querySelector('.success-postcard');
  const canvas = postcard.querySelector('canvas');
  assert.equal(canvas.width, 1000);
  assert.equal(canvas.height, 760);
  const texts = canvas.context.texts;
  assert.ok(texts.some((item) => item.text === 'У меня получилось!'));
  assert.ok(texts.some((item) => item.text === 'Открыть папку'));
  assert.ok(texts.some((item) => item.text.includes('2026')));
  assert.ok(texts.some((item) => item.text === 'У меня получилось!' && item.font === 'bold 58px Test Font'));
  await byText(postcard, 'Сохранить открытку PNG').onclick();
  assert.equal(postcard.querySelector('.postcard-status').textContent, 'Открытка сохранена.');
});

test('postcard falls back to a download link without a saver API', async () => {
  const h = homeHarness({ skills: [] });
  h.window.PushikHome.showPostcard({ name: 'Открыть папку', at: Date.now() });
  const postcard = h.document.querySelector('.success-postcard');
  await byText(postcard, 'Сохранить открытку PNG').onclick();
  assert.equal(h.document.clicks.length, 1);
  assert.equal(h.document.clicks[0].download, 'Первый успех с Пушиком.png');
  assert.match(h.document.clicks[0].href, /^data:image\/png/);
  assert.equal(postcard.querySelector('.postcard-status').textContent, 'Открытка подготовлена.');
});

test('postcard reports a failed save in plain language', async () => {
  const h = homeHarness({ skills: [], savePostcard: async () => { throw new Error('boom'); } });
  h.window.PushikHome.showPostcard({ name: 'Открыть папку', at: Date.now() });
  const postcard = h.document.querySelector('.success-postcard');
  await byText(postcard, 'Сохранить открытку PNG').onclick();
  assert.equal(postcard.querySelector('.postcard-status').textContent, 'Не удалось сохранить. Попробуй ещё раз.');
});

test('Escape closes the postcard first, then the home', () => {
  const h = homeHarness({ skills: [{ name: 'Открыть папку' }] });
  h.open();
  h.window.PushikHome.showPostcard({ name: 'Открыть папку', at: Date.now() });
  h.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(h.document.querySelector('.success-postcard'), null);
  assert.ok(h.document.querySelector('.skill-home'));
  h.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(h.document.querySelector('.skill-home'), null);
});

test('home offers the saved first success postcard', () => {
  const h = homeHarness({ skills: [], firstSuccessCard: { name: 'Открыть папку', at: Date.now() } });
  h.open();
  byText(h.document.querySelector('.skill-home'), 'Открытка первого успеха').onclick();
  assert.ok(h.document.querySelector('.success-postcard'));
});

test('first success event refreshes the home and schedules the postcard', () => {
  const h = homeHarness({ skills: [] });
  h.open();
  h.handlers['skill-earned']({ first: true, card: { name: 'Открыть папку', at: Date.now() } });
  assert.ok(h.document.querySelector('.skill-home'));
  assert.equal(h.calls.timers.length, 1);
  assert.equal(h.calls.timers[0].ms, 200);
  h.calls.timers[0].callback();
  assert.ok(h.document.querySelector('.success-postcard'));
});
