// Run with: node --test tools/test-playful.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { byText, makeDom } = require('./fake-dom');

const playfulSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'playful.js'), 'utf8');
const settle = () => new Promise((resolve) => setImmediate(resolve));

function playfulHarness({ skills = [] } = {}) {
  const { document, window } = makeDom();
  const sprite = document.createElement('div');
  sprite.id = 'sprite';
  document.body.append(sprite);
  const teach = document.createElement('button');
  teach.id = 'teach-cat';
  document.body.append(teach);

  const calls = {
    say: [], speak: [], setState: [], startGuide: [], endGuide: [],
    closePanels: 0, endTrainer: 0, hideBubble: 0, guideLook: [], addSkill: [],
  };
  const guide = { active: false, kind: '' };
  const settings = { skills };
  const api = {
    async guideLook(query) {
      calls.guideLook.push(query);
      return { screenSummary: 'экран' };
    },
    async addSkill(name) {
      calls.addSkill.push(name);
      settings.skills = [...settings.skills, { name, at: Date.now() }];
      return settings.skills;
    },
  };

  const context = {
    window, document, settings, api, guide,
    catEl: document.createElement('div'),
    bubble: Object.assign(document.createElement('div'), { className: 'bubble' }),
    PushikIcon: () => '<svg></svg>',
    showRing: () => {},
    hideRing: () => {},
    say: (...args) => calls.say.push(args),
    hideBubble: () => { calls.hideBubble += 1; },
    endGuide: (bye) => calls.endGuide.push(bye),
    startGuide: (task) => calls.startGuide.push(task),
    speak: (text) => calls.speak.push(text),
    setState: (state) => calls.setState.push(state),
    closePanels: () => { calls.closePanels += 1; },
    endTrainer: () => { calls.endTrainer += 1; },
    PushikInspect: { stop() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    innerHeight: 800,
    setTimeout,
    clearTimeout,
    bubbleTimer: undefined,
  };
  vm.createContext(context);
  vm.runInContext(playfulSource, context);

  return { document, window, settings, api, calls, guide, teach };
}

test('«Научи Пушика» offers the last three unique self-learned goals', () => {
  const h = playfulHarness({ skills: [
    { name: 'Самостоятельно: Открыть папку' },
    { name: 'Самостоятельно: Открыть папку' },
    { name: 'Изучено: Кнопка Пуск' },
    { name: 'Самостоятельно: Позвонить' },
    { name: 'Самостоятельно: Найти файл' },
    { name: 'Самостоятельно: Четвёртая' },
  ] });
  h.teach.onclick();
  const panel = h.document.querySelector('.teach-panel');
  assert.ok(panel);
  assert.equal(panel.querySelector('h2').textContent, 'Кот учится у тебя');
  const labels = panel.querySelectorAll('button').map((button) => button.textContent);
  assert.deepEqual(labels.slice(0, 3), ['Позвонить', 'Найти файл', 'Четвёртая']);
  assert.ok(labels.includes('Попробовать без подсказок'));
  assert.ok(labels.includes('Назад'));
  assert.equal(h.guide.active, true);
  assert.equal(h.guide.kind, 'recall');
  assert.deepEqual(h.calls.setState, ['busy']);
  assert.equal(h.calls.closePanels, 1);
  assert.equal(h.calls.endTrainer, 1);
  h.window.PushikPlayful.stopTeach();
  assert.equal(h.document.querySelector('.teach-panel'), null);
});

test('choosing a goal remembers the starting screen before asking for help', async () => {
  const h = playfulHarness({ skills: [{ name: 'Самостоятельно: Позвонить' }] });
  h.window.PushikPlayful.chooseTeach();
  byText(h.document.querySelector('.teach-panel'), 'Позвонить').onclick();
  await settle();

  const query = h.calls.guideLook[0];
  assert.equal(query.mode, 'recall_start');
  assert.equal(query.goal, 'Позвонить');
  assert.equal(query.history.length, 0);
  assert.equal(query.previousSummary, '');
  assert.equal(h.calls.endGuide.at(-1), false);
  assert.ok(h.calls.say.some((args) => args[0] === 'Запоминаю, с чего мы начали…'));
  const waiting = h.document.querySelector('.teach-panel');
  assert.match(waiting.textContent, /Я забыл, как это сделать: «Позвонить»\. Покажи мне!/);
  assert.ok(byText(waiting, 'Показать результат'));
  assert.ok(byText(waiting, 'Нужна подсказка'));
  assert.ok(byText(waiting, 'Завершить'));
});

test('a confirmed result adds the skill and celebrates', async () => {
  const h = playfulHarness({ skills: [{ name: 'Самостоятельно: Позвонить' }] });
  let look = 0;
  h.api.guideLook = async (query) => {
    h.calls.guideLook.push(query);
    look += 1;
    return look === 1 ? { screenSummary: 'экран' } : { status: 'done', whatChanged: 'Получилось!' };
  };
  h.window.PushikPlayful.chooseTeach();
  byText(h.document.querySelector('.teach-panel'), 'Позвонить').onclick();
  await settle();
  byText(h.document.querySelector('.teach-panel'), 'Показать результат').onclick();
  await settle();

  assert.equal(h.calls.guideLook.length, 2);
  assert.equal(h.calls.guideLook[1].mode, 'recall_check');
  assert.equal(h.calls.guideLook[1].previousSummary, 'экран');
  assert.deepEqual(h.calls.addSkill, ['Самостоятельно: Позвонить']);
  assert.ok(h.settings.skills.some((skill) => skill.name === 'Самостоятельно: Позвонить'));
  assert.ok(h.calls.say.some((args) => args[0] === 'Получилось!'));
  assert.deepEqual(h.calls.speak, ['Получилось! Теперь я вспомнил.']);
  const done = h.calls.say.find((args) => args[0] === 'Получилось!');
  assert.deepEqual(Array.from(done[2].actions, (action) => action[0]), ['Ещё задание', 'Закрыть']);
});

test('the hint button starts the guide for the same goal', async () => {
  const h = playfulHarness({ skills: [{ name: 'Самостоятельно: Позвонить' }] });
  h.window.PushikPlayful.chooseTeach();
  byText(h.document.querySelector('.teach-panel'), 'Позвонить').onclick();
  await settle();
  byText(h.document.querySelector('.teach-panel'), 'Нужна подсказка').onclick();

  assert.deepEqual(h.calls.startGuide, ['Позвонить']);
  assert.equal(h.document.querySelector('.teach-panel'), null);
});

test('a free-form goal starts the same screen check', async () => {
  const h = playfulHarness();
  h.window.PushikPlayful.chooseTeach();
  const panel = h.document.querySelector('.teach-panel');
  const input = panel.querySelector('input');
  assert.equal(input.maxLength, 200);
  input.value = 'Найти файл';
  panel.querySelector('form').onsubmit({ preventDefault() {} });
  await settle();

  assert.equal(h.calls.guideLook[0].mode, 'recall_start');
  assert.equal(h.calls.guideLook[0].goal, 'Найти файл');
  assert.match(h.document.querySelector('.teach-panel').textContent, /«Найти файл»/);
});

test('look errors are shown in plain language', async () => {
  const h = playfulHarness();
  h.api.guideLook = async () => { throw new Error('network'); };
  h.window.PushikPlayful.chooseTeach();
  const panel = h.document.querySelector('.teach-panel');
  panel.querySelector('input').value = 'Найти файл';
  panel.querySelector('form').onsubmit({ preventDefault() {} });
  await settle();

  const waiting = h.document.querySelector('.teach-panel');
  assert.match(waiting.textContent, /Не удалось проверить экран\. Попробуй ещё раз\./);
  assert.ok(byText(waiting, 'Повторить'));
  assert.ok(byText(waiting, 'Завершить'));
});

test('Escape closes the recall panel', () => {
  const h = playfulHarness();
  h.window.PushikPlayful.chooseTeach();
  assert.ok(h.document.querySelector('.teach-panel'));
  h.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(h.document.querySelector('.teach-panel'), null);
});
