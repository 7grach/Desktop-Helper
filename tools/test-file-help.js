// Run with: node --test tools/test-file-help.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function coachHarness() {
  const timers = new Map(); let sequence = 0;
  const element = () => ({ addEventListener() {}, appendChild() {}, textContent: '' });
  const status = element();
  const c = vm.createContext({
    window: {}, document: { querySelector: () => status, querySelectorAll: () => [], createElement: element },
    settings: { platform: 'darwin', locator: true }, guide: {}, cat: { state: 'busy' },
    I18N: { lang: 'ru', list: () => ['checking'] }, T: (s) => s, pick: (a) => a[0],
    api: { locate: async (q) => (q.op === 'top' || q.op === 'window') ? { win: c.top } : { items: c.items || [] }, filesAction: async () => ({ trusted: true, ok: true }) },
    top: { proc: 'Finder', title: 'Пушик — учимся работать с файлами' },
    say: (...args) => { c.bubble = args; }, speak() {}, showRing() {}, hideRing() {}, goPoint: (_, cb) => cb?.(),
    Sound: { meow() {} }, happy() {}, celebrate() {}, startFall() {}, closePanels() {}, endTrainer() {},
    endGuide() {}, imLost() {}, showPanel: (name) => { c.panel = name; },
    setTimeout: (fn) => { timers.set(++sequence, fn); return sequence; }, clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { timers.set(++sequence, fn); return sequence; }, clearInterval: (id) => timers.delete(id),
  });
  vm.runInContext(fs.readFileSync('src/renderer/scenarios.js', 'utf8'), c);
  c.Scenarios = c.window.Scenarios;
  vm.runInContext(fs.readFileSync('src/renderer/coach.js', 'utf8'), c);
  return { c, run: (code) => vm.runInContext(code, c), timers };
}

test('Finder lesson waits for the right folder in Finder, not an unrelated window', async () => {
  const { c, run } = coachHarness();
  assert.equal(await run("check({filePlace:'practice'}, {})"), true);
  c.top = { proc: 'TextEdit', title: 'Мои открытки' };
  assert.equal(await run("check({filePlace:'postcards'}, {})"), false);
  c.top = { proc: 'Finder', title: 'Мои открытки' };
  assert.equal(await run("check({filePlace:'postcards'}, {})"), true);
});

test('lesson starts with opening the practice folder; duplicate completion cannot skip a step', async () => {
  const { c, run, timers } = coachHarness();
  run("runScenario(Scenarios.list.find(s => s.id === 'files-learn'))");
  await new Promise(setImmediate);
  assert.equal(run('coach.i'), 0);
  assert.equal(run('coach.steps[0].find.name'), 'Мои открытки');
  await run('doneClicked()');
  assert.equal(run('coach.advancing'), false);
  c.top = { proc: 'Finder', title: 'Мои открытки' };
  await run('doneClicked()');
  const timer = run('coach.advance');
  await run('doneClicked()');
  assert.equal(run('coach.advance'), timer);
  assert.equal(run('coach.i'), 0);
  await timers.get(timer)();
  assert.equal(run('coach.i'), 1);
  await run('doneClicked()');
  assert.equal(run('coach.i'), 1); // folder has not been opened
  run('stopCoach()');
});

test('stopping cancels pending advancement and a delayed lookup cannot resurrect a hint', async () => {
  const { c, run, timers } = coachHarness();
  run("runScenario(Scenarios.list.find(s => s.id === 'files-learn'))");
  await new Promise(setImmediate);
  c.top = { proc: 'Finder', title: 'Мои открытки' };
  await run('doneClicked()');
  const timer = run('coach.advance');
  run('stopCoach()');
  assert.equal(timers.has(timer), false);
  let resolve;
  c.api.locate = () => new Promise((r) => { resolve = r; });
  run('coach.active = true; coach.advancing = false');
  const pending = run('showCoachStep()');
  run('stopCoach()'); c.bubble = null;
  resolve({ win: c.top }); await pending;
  assert.equal(c.bubble, null);
});

test('file lessons live in «Уроки»; downloaded-file goal wins over generic internet search', () => {
  const { run } = coachHarness();
  const names = run("lessons().map((l) => l.name).join('|')");
  assert.match(names, /Папки, файлы и поиск/);
  assert.match(names, /Найти скачанный файл/);
  assert.equal(run("Scenarios.match('найти скачанный файл').id"), 'files-downloads');
});

test('practice files survive repeated setup; folder actions reject arbitrary paths; picker cancel does not open', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pushik-files-test-'));
  const opened = [];
  const electron = {
    app: { getPath: () => dir }, shell: { openPath: async (p) => { opened.push(p); return ''; } },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  };
  const c = vm.createContext({ module: { exports: {} }, require: (name) => name === 'electron' ? electron : require(name), process });
  vm.runInContext(fs.readFileSync('src/files.js', 'utf8'), c);
  const { action } = c.module.exports;
  try {
    assert.equal((await action({ op: 'open', place: 'practice' })).ok, true);
    const file = path.join(opened[0], 'Привет от Пушика.txt');
    await fsp.writeFile(file, 'learner edit');
    await action({ op: 'open', place: 'practice' });
    assert.equal(await fsp.readFile(file, 'utf8'), 'learner edit');
    const count = opened.length;
    assert.ok((await action({ op: 'open', place: '../../private' })).error);
    assert.equal((await action({ op: 'choose' })).canceled, true);
    assert.equal(opened.length, count);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});

test('folder completion checks Finder even while the coach or another app is in front', async () => {
  const { c, run } = coachHarness();
  const requests = [];
  c.api.locate = async (q) => {
    requests.push(q);
    return { win: q.op === 'window' ? { proc: 'Finder', title: 'Мои открытки' } : { proc: 'Electron', title: 'Пушик' } };
  };
  assert.equal(await run("check({filePlace:'postcards'}, {})"), true);
  assert.equal(requests[0].op, 'window');
  assert.equal(requests[0].scope, 'proc:^Finder$');
});

test('a Finder control appearing after navigation triggers both the ring and the cat jump', async () => {
  const { c, run, timers } = coachHarness();
  let rings = 0; let jumps = 0;
  c.showRing = () => rings++;
  c.goPoint = (_, cb) => { jumps++; cb?.(); };
  run("runScenario(Scenarios.list.find(s => s.id === 'files-learn'))");
  await new Promise(setImmediate);
  assert.equal(c.bubble[2].explain.includes('files.missing'), false);
  c.items = [{ name: 'Мои открытки', type: 'AXStaticText', x: 227, y: 460, w: 96, h: 18 }];
  await timers.get(run('coach.poll'))();
  assert.equal(rings, 1);
  assert.equal(jumps, 1);
  assert.ok(c.bubble[0].includes('files.progress'));
  run('stopCoach()');
});

test('macOS fallback returns JSON from its run handler and skips the sharing control window', () => {
  const { _MAC_SCRIPT, _MAC_ROLES } = require('../src/locate');
  const props = (title, w, h) => ({ name: () => title, position: () => [188, 188], size: () => [w, h], attributes: { byName: () => ({ value: () => false }) } });
  const folder = { ...props('', 96, 18), role: () => 'AXTextField', description: () => '', title: () => '', value: () => 'Мои открытки', focused: () => false };
  const actual = { ...props('Пушик — учимся работать с файлами', 920, 464), entireContents: () => [folder] };
  const proc = { name: () => 'Finder', windows: () => [props('Window', 52, 20), actual] };
  const q = { op: 'find', scope: 'proc:^Finder$', firstWindow: true, name: 'Мои открытки', roles: _MAC_ROLES.ListItem };
  const c = vm.createContext({ Application: () => ({ processes: { whose: () => () => [proc] } }), ObjC: { import() {} } });
  vm.runInContext(_MAC_SCRIPT(q, 1), c);
  const reply = vm.runInContext('run()', c);
  assert.equal(typeof reply, 'string');
  const result = JSON.parse(reply);
  assert.equal(result.win.title, 'Пушик — учимся работать с файлами');
  assert.equal(result.items[0].name.trim(), 'Мои открытки');
  assert.equal(result.items[0].type, 'AXTextField');
});

test('dragging the cat preserves the lesson and restores its current instruction', async () => {
  const { c, run, timers } = coachHarness();
  const docHandlers = {}; const catHandlers = {};
  c.document.addEventListener = (name, fn) => { docHandlers[name] = fn; };
  c.catEl = { addEventListener: (name, fn) => { catHandlers[name] = fn; } };
  c.cat = { state: 'busy', x: 200, y: 400 };
  c.trainer = {};
  c.setState = (state) => { c.cat.state = state; };
  let falls = 0;
  c.startFall = () => { falls++; };
  c.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  c.floorY = () => 660;
  c.placeBubble = () => {};
  c.onCatClick = () => {};
  c.cancelPointGaze = () => {};
  const source = fs.readFileSync('src/renderer/app.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('let press = null;'), source.indexOf('let clicks = [];')), c);
  run("runScenario(Scenarios.list.find(s => s.id === 'files-learn'))");
  await new Promise(setImmediate);
  catHandlers.mousedown({ button: 0, target: { closest: () => null }, preventDefault() {}, clientX: 230, clientY: 430 });
  docHandlers.mousemove({ clientX: 330, clientY: 230 });
  assert.equal(c.cat.state, 'drag');
  c.top = { proc: 'Finder', title: 'Мои открытки' };
  await timers.get(run('coach.poll'))();
  assert.equal(run('coach.advancing'), false);
  docHandlers.mouseup();
  assert.equal(c.guide.active, true);
  assert.equal(run('coach.active'), true);
  assert.equal(run('coach.i'), 0);
  assert.equal(run('coach.keepPosition'), true);
  assert.equal(c.cat.state, 'perch');
  assert.equal(c.cat.y, 200);
  assert.equal(falls, 0);
  assert.ok(c.bubble[0].includes('Мои открытки'));
  run('stopCoach()');
});

test('instruction stays inside the viewport as the cat moves from top to bottom', () => {
  const source = fs.readFileSync('src/renderer/app.js', 'utf8');
  const classes = new Set();
  const c = vm.createContext({
    cat: { x: 20, y: 0 }, CAT_W: 150, CAT_H: 140, size: () => 1,
    W: () => 1280, H: () => 800,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    bubble: { offsetWidth: 340, offsetHeight: 450, style: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
  });
  vm.runInContext(source.slice(source.indexOf('function placeBubble()'), source.indexOf('// Поза на время')), c);
  for (const [x, y] of [[20, 0], [1100, 0], [1100, 660], [20, 660], [600, -200]]) {
    c.cat.x = x; c.cat.y = y;
    vm.runInContext('placeBubble()', c);
    const [dx, dy] = c.bubble.style.translate.split(' ').map(parseFloat);
    const top = (classes.has('below') ? y + 154 : y + 12 - 450) + dy;
    const left = x + 75 - 170 + dx;
    assert.ok(top >= 8 && top + 450 <= 792, `vertical position at cat ${x},${y}`);
    assert.ok(left >= 8 && left + 340 <= 1272, `horizontal position at cat ${x},${y}`);
    if (y === 660) assert.equal(classes.has('below'), false);
  }
});
