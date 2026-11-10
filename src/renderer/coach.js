/* Ведущий по готовым сценариям (scenarios.js): работает без ИИ и без интернета.
   Кот находит нужную кнопку через системную «доступность», показывает на неё лапкой
   и сам замечает, что шаг сделан (открылось окно, вставили флешку, пропала кнопка). */

const coach = { active: false, sc: null, steps: [], i: -1, ctx: {}, target: null, seen: false, baseTitle: '', poll: null, polling: false, run: 0, idle: null, warnedAccess: false };

const plat = () => (settings.platform === 'darwin' ? 'mac' : 'win');
const stepSay = (step) => fillText(!coach.ctx.contact && step.sayNoContact ? step.sayNoContact : step.say);
const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fillText(s) {
  return String(s || '')
    .replace(/\{contact\}/g, coach.ctx.contact || T('coach.grandson'))
    .replace(/\{drive\}/g, coach.ctx.drive ? `(${coach.ctx.drive}:)` : '')
    .replace(/\{label\}/g, coach.ctx.label || T('coach.usb'))
    .replace(/\s+/g, ' ').trim();
}
function fillQuery(q) {
  if (!q) return null;
  let name = q.name || '';
  if (name.includes('{contact}') && !coach.ctx.contact) return null; // не знаем имени: просто говорим словами
  name = name.replace(/\{contact\}/g, esc(coach.ctx.contact))
    .replace(/\{drive\}/g, esc(coach.ctx.drive || 'Z'))
    .replace(/\{label\}/g, coach.ctx.label ? esc(coach.ctx.label) : 'USB|Съёмный|Removable');
  return { op: 'find', scope: q.scope, name, types: q.types || [], enabled: q.enabled, firstWindow: q.firstWindow };
}

async function locate(q) {
  if (!q || !settings.locator) return [];
  const res = await api.locate(q);
  coach.locateError = res.error || '';
  if (res.error === 'access' && !coach.warnedAccess) {
    coach.warnedAccess = true;
    say(T('coach.noAccess'), 6000, { guide: true });
  }
  let items = res.items || [];
  if (q.enabled) items = items.filter((it) => it.enabled);
  return items;
}

async function readVolume() {
  const res = settings.locator ? await api.locate({ op: 'volume' }) : {};
  return typeof res.volume === 'number' ? { volume: res.volume, muted: !!res.muted } : null;
}

// Выполнено ли условие шага
async function check(cond, step) {
  if (!cond) return false;
  if (cond.any) {
    for (const c of cond.any) if (await check(c, step)) return true;
    return false;
  }
  if (cond.manual) return false;
  if (cond.volumeUp || cond.volumeMax) {
    // громкость меряем сами: человеку не надо ничего подтверждать
    const v = await readVolume();
    if (!v) return false;
    if (cond.volumeMax) return !v.muted && v.volume >= 0.97;
    const v0 = coach.ctx.vol0;
    return !!v0 && ((v0.muted && !v.muted) || (!v.muted && v.volume > v0.volume + 0.03));
  }
  if (cond.filePlace) {
    // Окно с папкой: Finder на Mac, Проводник на Windows. Окно кота не мешает: ищем по программе.
    const proc = plat() === 'mac' ? '^Finder$' : '^explorer$';
    const result = await api.locate({ op: 'window', scope: `proc:${proc}`, firstWindow: true });
    if (result.error) { coach.fileError = result.error; return false; }
    if (cond.foreground) {
      const front = await api.locate({ op: 'top' });
      if (!new RegExp(proc, 'i').test(front.win?.proc || '')) return false;
    }
    const titles = { practice: 'Пушик — учимся работать с файлами', postcards: 'Мои открытки', downloads: 'Загрузки|Downloads' };
    return !!result.win && new RegExp(proc, 'i').test(result.win.proc || '') && new RegExp(`^(${titles[cond.filePlace]})$`, 'i').test(result.win.title || '');
  }
  if (cond.drive) {
    const res = await api.locate({ op: 'drives' });
    const d = (res.drives || [])[0];
    if (d) { coach.ctx.drive = d.letter; coach.ctx.label = d.label || ''; }
    return !!d;
  }
  if (cond.top || cond.titleChange) {
    const res = await api.locate({ op: 'top' });
    const w = res.win;
    if (!w) return false;
    if (cond.top) return new RegExp(cond.top, 'i').test(w.proc || '');
    return !!coach.baseTitle && w.title !== coach.baseTitle;
  }
  if (cond.find) return (await locate(fillQuery(cond.find))).length > 0;
  if (cond.next) {
    const next = coach.steps[coach.i + 1];
    return !!next?.find && (await locate(fillQuery(next.find))).length > 0;
  }
  if (cond.focus) return (await locate(fillQuery(step.find))).some((it) => it.focused);
  if (cond.gone) return coach.seen && (await locate(fillQuery(step.find))).length === 0;
  return false;
}

function coachStepActions(step) {
  const acts = [[coach.sc.fileLesson && step.wait?.manual ? (step.find?.types?.includes('Edit') ? 'Нашёл файл' : T('files.next')) : T(step.btn || 'g.done'), () => doneClicked(), true], [T(coach.sc.fileLesson ? 'files.again' : 'g.again'), () => showCoachStep(true)]];
  if (coach.sc.fileLesson) acts.push([T('files.help'), () => {
    clearInterval(coach.poll);
    clearTimeout(coach.idle);
    hideRing();
    say(stepSay(step), Infinity, { guide: true, explain: coach.fileError === 'automation' ? T('files.automation') : step.hint, actions: [[T('files.again'), () => showCoachStep(true), true], [T('files.menu'), () => { endGuide(false); showPanel('lessons'); }]] });
  }]);
  if (step.openFolder) acts.push(['Открыть папку', async () => {
    const result = await api.filesAction({ op: 'open', place: step.openFolder });
    if (!coach.active) return;
    if (result.error) say(T('files.error'), Infinity, { guide: true, actions: coachStepActions(step) });
    else showCoachStep(true);
  }]);
  if (step.open) acts.push([T('coach.open'), () => openForMe(step)]);
  acts.push([T('g.stop'), () => endGuide(true)]);
  return acts;
}

function coachExplanation(step, missing = false) {
  if (!coach.sc.fileLesson) return '';
  const error = coach.locateError;
  const prefix = error === 'access' ? T('files.access')
    : error === 'automation' ? T('files.automation')
    : error && error !== 'no_window' ? T('files.readError')
    : missing ? T('files.missing') : '';
  return [prefix, step.hint].filter(Boolean).join(' ');
}
function coachText(step) {
  return coach.sc.fileLesson ? `${T('files.progress', { n: coach.i + 1, total: coach.steps.length })}\n${stepSay(step)}` : stepSay(step);
}
async function showCoachStep(repeat = false) {
  const run = coach.run;
  const step = coach.steps[coach.i];
  if (!step || !coach.active) return;
  if (coach.advancing) return;
  if (cat.state === 'drag') return;
  coach.keepPosition = false;
  const text = coachText(step);
  const top = step.wait?.titleChange ? await api.locate({ op: 'top' }) : {};
  if (!coach.active || coach.steps[coach.i] !== step || coach.run !== run) return;
  if (!repeat) { coach.baseTitle = top.win?.title || ''; coach.seen = false; coach.misses = 0; }
  const items = await locate(fillQuery(step.find));
  if (!coach.active || coach.steps[coach.i] !== step || coach.run !== run) return;
  coach.target = items[0] || null;
  if (cat.state === 'drag') return;
  if (coach.target) coach.seen = true;
  if (!coach.target && step.optional && step.find && !repeat) { nextStep(); return; }
  const sayIt = () => {
    say(text, Infinity, { actions: coachStepActions(step), guide: true, explain: coachExplanation(step, repeat && !coach.target && !!step.find) });
    speak(stepSay(step));
  };
  if (coach.target) { showRing(coach.target); goPoint(coach.target, () => { if (coach.active && coach.run === run && coach.steps[coach.i] === step) sayIt(); }); } else { hideRing(); if (cat.state === 'perch') startFall(); sayIt(); }
  if (repeat) Sound.meow(1.1);
  startPoll();
}

function startPoll() {
  clearInterval(coach.poll);
  clearTimeout(coach.idle);
  coach.poll = setInterval(async () => {
    if (coach.polling || !coach.active || cat.state === 'drag') return;
    coach.polling = true;
    const run = coach.run;
    try {
      const step = coach.steps[coach.i];
      if (!step) return;
      const complete = !step.wait?.manual && await check(step.wait, step);
      if (!coach.active || coach.steps[coach.i] !== step || coach.run !== run) return;
      if (cat.state === 'drag') return;
      if (complete) { stepDone(); return; }
      if (step.find) {
        const items = await locate(fillQuery(step.find));
        if (!coach.active || coach.steps[coach.i] !== step || coach.run !== run || coach.advancing || cat.state === 'drag') return;
        const previous = coach.target;
        coach.target = items[0] || null;
        if (coach.target) {
          coach.seen = true;
          coach.misses = 0;
          showRing(coach.target);
          if (!previous) {
            const displayHint = () => {
              if (coach.active && coach.run === run && coach.steps[coach.i] === step) say(coachText(step), Infinity, { actions: coachStepActions(step), guide: true, explain: coachExplanation(step) });
            };
            if (coach.keepPosition) displayHint(); else goPoint(coach.target, displayHint);
          }
        } else {
          hideRing();
          coach.misses = (coach.misses || 0) + 1;
          // Allow Finder to finish opening/navigating before declaring a missing control.
          if (coach.sc.fileLesson && coach.misses === 3) say(coachText(step), Infinity, { actions: coachStepActions(step), guide: true, explain: coachExplanation(step, true) });
        }
      }
    } finally { coach.polling = false; }
  }, 1200);
  // кот не заговаривает сам: подсказка просто остаётся на экране, пока человек не нажмёт кнопку
}

function stepDone() {
  if (!coach.active || coach.advancing || cat.state === 'drag') return;
  coach.advancing = true;
  clearInterval(coach.poll);
  hideRing();
  happy(700);
  Sound.meow(1.25);
  clearTimeout(coach.advance);
  coach.advance = setTimeout(nextStep, 500);
}

async function nextStep() {
  if (!coach.active) return;
  const run = coach.run;
  coach.advancing = false;
  coach.i++;
  coach.target = null;
  coach.keepPosition = false;
  // шаги, которые уже сделаны (флешка уже вставлена, WhatsApp уже открыт), пропускаем
  while (coach.active && coach.run === run && coach.i < coach.steps.length && await check(coach.steps[coach.i].skipIf, coach.steps[coach.i])) coach.i++;
  if (!coach.active || coach.run !== run) return;
  if (coach.i >= coach.steps.length) { finishScenario(); return; }
  showCoachStep();
}

async function doneClicked() {
  const run = coach.run;
  const step = coach.steps[coach.i];
  if (!step || coach.advancing || cat.state === 'drag') return;
  if (step.wait?.manual) { stepDone(); return; }
  // громкость прочитать не удалось: верим человеку на слово
  if (step.wait?.volumeUp && !coach.ctx.vol0) { stepDone(); return; }
  say(pick(I18N.list('g.checking')), Infinity, { guide: true });
  const complete = step.allowConfirm || await check(step.wait, step) || (!coach.sc.fileLesson && await check({ next: true }, step));
  if (!coach.active || coach.steps[coach.i] !== step || coach.run !== run) return;
  if (complete) { stepDone(); return; }
  say(T('coach.notYet'), Infinity, { actions: coachStepActions(step), guide: true });
  speak(T('coach.notYet'));
  if (coach.target) goPoint(coach.target);
}

async function openForMe(step) {
  say(T('coach.opening'), 2500, { guide: true });
  if (step.open === 'drive') await api.openDrive(coach.ctx.drive);
  else await api.openUri(step.open);
  clearInterval(coach.poll);
  hideRing();
  // после «открой за меня» следующий осмысленный шаг: тот, где открытое окно уже нужно
  const after = { 'ms-settings:easeofaccess-display': 'Slider', 'ms-settings:sound': 'Slider', drive: null };
  const want = after[step.open];
  setTimeout(() => {
    if (!coach.active) return;
    if (want) {
      const j = coach.steps.findIndex((s) => s.find?.types?.includes(want));
      if (j >= coach.i) coach.i = j - 1;
    } else if (step.open === 'drive') {
      const j = coach.steps.findIndex((s, k) => k > coach.i && s.optional);
      if (j > coach.i) coach.i = j - 1;
    }
    nextStep();
  }, 2500);
}

async function finishScenario() {
  const sc = coach.sc;
  stopCoach();
  guide.active = false;
  hideRing();
  const maxed = sc.id === 'volume' && coach.ctx.vol0 && !coach.ctx.vol0.muted && coach.ctx.vol0.volume >= 0.97;
  const text = (maxed && T('coach.volMax')) || sc.done || pick(I18N.list('g.success'));
  say(`${text}\n${T('g.skillSaved')}`, 8000, { guide: true });
  speak(text);
  celebrate();
  settings.skills = await api.addSkill(sc.skill[I18N.lang] || sc.skill.ru);
  setTimeout(() => { if (cat.state === 'perch') startFall(); }, 2500);
  if (sc.id === 'tour') setTimeout(pointToLessons, 4000);
}

// После обзора: открываем главное окно и подсвечиваем кнопку «Уроки»
function pointToLessons() {
  if (guide.active || trainer.step) return;
  hideBubble();
  showPanel('help');
  const b = document.querySelector('.extras [data-act="lessons"]');
  b.classList.add('pulse');
  micState(T('les.here'));
  speak(T('les.here'));
  setTimeout(() => b.classList.remove('pulse'), 12000);
}

// Первый запуск: после тренировки мышки сразу обзор компьютера
function startTourOnce() {
  const name = Scenarios.byId('tour').skill[I18N.lang] || Scenarios.byId('tour').skill.ru;
  if ((settings.skills || []).some((x) => x.name === name)) return;
  runScenario(Scenarios.byId('tour'));
}

// После переноса сохраняем шаг и выбранное место. Это общая логика для обеих ОС.
// Новый прыжок нужен только для следующего шага или явного повтора подсказки.
function resumeCoachAfterDrag() {
  if (!coach.active || coach.advancing) return;
  const step = coach.steps[coach.i];
  if (!step) return;
  coach.keepPosition = true;
  say(coachText(step), Infinity, { guide: true, actions: coachStepActions(step), explain: coachExplanation(step) });
  if (coach.target) showRing(coach.target);
  startPoll();
}

function stopCoach() {
  coach.active = false;
  coach.run++;
  clearTimeout(coach.advance);
  clearInterval(coach.poll);
  clearTimeout(coach.idle);
}

function runScenario(sc) {
  closePanels();
  endTrainer();
  if (guide.active) endGuide(false);
  stopCoach();
  coach.advancing = false;
  coach.fileError = '';
  coach.locateError = '';
  coach.misses = 0;
  coach.sc = sc;
  coach.steps = sc[plat()] || sc.win;
  coach.i = -1;
  coach.ctx = { contact: String(settings.contact || '').trim() };
  coach.active = true;
  guide.active = true;      // для остального кода кот сейчас занят человеком
  guide.kind = 'script';
  guide.goal = '';
  if (!settings.locator) say(T('coach.noLocator'), 3500, { guide: true });
  if (sc.id === 'volume') {
    // запоминаем громкость в начале, чтобы потом самому заметить, что стало громче
    readVolume().then((v) => { if (coach.sc === sc && coach.active) { coach.ctx.vol0 = v; nextStep(); } });
    return;
  }
  nextStep();
}

// Кнопка-задача или фраза человека → готовый сценарий, иначе ИИ (если есть), иначе подсказка.
function routeGoal(text) {
  if (/помо[гщ].*(файл|проводник|finder)|help with files/i.test(text)) { startFileLesson('files-learn'); return; }
  const m = Scenarios.match(text);
  if (m?.fileLesson) { startFileLesson(m.id); return; }
  if (m?.id === 'lost') { imLost(); return; }
  if (m) { runScenario(m); return; }
  if (settings.aiReady) { startGuide(goalOf(text)); return; }
  showPanel('help');
  micState(T('coach.unknown'));
  speak(T('coach.unknown'));
}

// «Я запутался» без ИИ: какое окно открыто и где у него крестик.
const APP_NAMES = {
  chrome: 'браузер Google Chrome, это интернет', msedge: 'браузер Edge, это интернет', firefox: 'браузер Firefox, это интернет',
  browser: 'Яндекс Браузер, это интернет', opera: 'браузер Opera, это интернет', safari: 'браузер Safari, это интернет',
  explorer: 'Проводник, здесь папки и файлы', finder: 'Finder, здесь папки и файлы', whatsapp: 'WhatsApp',
  telegram: 'Telegram', winword: 'Word, здесь пишут тексты', excel: 'Excel, здесь таблицы',
  systemsettings: 'Параметры компьютера', applicationframehost: 'программа Windows', 'system settings': 'Настройки компьютера',
  photos: 'Фотографии', microsoft: 'программа Microsoft', notepad: 'Блокнот', preview: 'Просмотр картинок',
};
async function lostOffline() {
  const wasCoach = coach.active;
  clearInterval(coach.poll);
  catEl.classList.add('thinking');
  const res = settings.locator ? await api.locate({ op: 'top' }) : {};
  catEl.classList.remove('thinking');
  const w = res.win;
  const back = () => {
    hideBubble();
    hideRing();
    if (wasCoach && coach.active) showCoachStep(true);
    else { guide.active = false; if (cat.state === 'perch') startFall(); }
  };
  const okLost = () => { back(); api.addSkill(T('les.lost')).then((sk) => { settings.skills = sk; }); };
  const acts = [[T('g.ok'), okLost, true], [T('g.stop'), () => endGuide(true)]];
  if (!w) {
    say(T('lost.desktop'), Infinity, { actions: acts, guide: true });
    speak(T('lost.desktop'));
    return;
  }
  const key = String(w.proc || '').toLowerCase();
  const name = APP_NAMES[key] || Object.entries(APP_NAMES).find(([k]) => key.includes(k))?.[1] || `«${w.title || w.proc}»`;
  const text = T('lost.window', { name });
  const tip = w.close ? T('lost.close') : T('lost.noClose');
  const show = () => { say(text, Infinity, { actions: acts, guide: true, explain: tip }); speak(`${text} ${tip}`); };
  if (w.close) { showRing(w.close); goPoint(w.close, show); } else show();
}

// imLost из app.js: без ИИ отвечаем сами
const imLostAI = imLost;
imLost = function imLostAny() {
  if (settings.aiReady) { imLostAI(); return; }
  closePanels();
  endTrainer();
  guide.active = true;
  if (!coach.active) guide.kind = 'lost';
  lostOffline();
};

// endGuide из app.js: заодно останавливаем сценарий
const endGuideAI = endGuide;
endGuide = function endGuideAll(sayBye) {
  stopCoach();
  endGuideAI(sayBye);
};

// «Уроки»: все обучалки по порядку, что пройдено и общий прогресс.
const LESSON_ICONS = { 'files-learn': 'folder', 'files-downloads': 'folder', tour: 'paw', photos: 'photos', call: 'call', search: 'search', volume: 'volume', bigger: 'type' };
function lessons() {
  const lang = I18N.lang;
  return [
    { name: T('les.mouse'), icon: 'mouse', start: () => startTrainer() },
    ...Scenarios.list.map((sc) => ({ name: sc.skill[lang] || sc.skill.ru, icon: LESSON_ICONS[sc.id] || 'paw', start: () => (sc.fileLesson ? startFileLesson(sc.id) : runScenario(sc)) })),
    { name: T('files.chooseSkill'), icon: 'folder', start: () => chooseDocument() },
  ];
}
function renderLessons() {
  const done = new Set((settings.skills || []).map((x) => x.name.toLowerCase()));
  const list = lessons();
  const passed = list.filter((l) => done.has(l.name.toLowerCase())).length;
  $('#les-bar').style.width = `${Math.round((passed / list.length) * 100)}%`;
  $('#les-count').textContent = passed === list.length ? T('les.all') : T('les.progress', { done: passed, all: list.length });
  const ul = $('#les-list');
  ul.innerHTML = '';
  for (const l of list) {
    const ok = done.has(l.name.toLowerCase());
    const li = document.createElement('li');
    li.className = ok ? 'done' : '';
    li.insertAdjacentHTML('beforeend', `<span class="les-icon">${PushikIcon(ok ? 'check' : l.icon)}</span>`);
    const text = document.createElement('div');
    text.className = 'les-text';
    const b = document.createElement('b');
    b.textContent = l.name;
    const st = document.createElement('span');
    st.className = 'sub';
    st.textContent = T(ok ? 'les.done' : 'les.todo');
    text.append(b, st);
    const go = document.createElement('button');
    go.className = ok ? 'ghost' : 'primary';
    go.textContent = T(ok ? 'les.again' : 'les.start');
    go.addEventListener('click', () => { closePanels(); l.start(); });
    li.append(text, go);
    ul.appendChild(li);
  }
  // что ещё получилось с ИИ (свободные задачи)
  const names = new Set(list.map((l) => l.name.toLowerCase()));
  const extra = (settings.skills || []).filter((x) => !names.has(x.name.toLowerCase()));
  if (extra.length) {
    const li = document.createElement('li');
    li.className = 'les-more sub';
    li.textContent = `${T('les.more')}: ${extra.map((x) => x.name).join(', ')}`;
    ul.appendChild(li);
  }
}

// Уроки про файлы: сначала открываем настоящую папку (Finder или Проводник), потом ведём по шагам.
let fileLaunch = 0;
async function startFileLesson(id) {
  const launch = ++fileLaunch;
  closePanels();
  const sc = Scenarios.list.find((s) => s.id === id);
  if (!sc) return;
  const back = [T('files.menu'), () => { hideBubble(); showPanel('lessons'); }];
  if (plat() === 'mac') {
    const access = await api.filesAction({ op: 'access' });
    if (launch !== fileLaunch) return;
    if (!access.trusted) {
      say(T('files.access'), Infinity, { guide: true, actions: [[T('files.permissions'), () => api.filesAction({ op: 'permissions' }), true], [T('files.retry'), () => startFileLesson(id)], back] });
      return;
    }
  }
  say(T('files.opening'), Infinity, { guide: true });
  const result = await api.filesAction({ op: 'open', place: sc.place });
  if (launch !== fileLaunch) return;
  if (result.error) { say(T('files.error'), Infinity, { guide: true, actions: [[T('g.retry'), () => startFileLesson(id), true], back] }); return; }
  // Окно с папкой может ещё открываться: опрос сам найдёт кнопки, когда оно появится.
  runScenario(sc);
}

// «Открыть свой документ»: привычное окно выбора файла, без подсветки
async function chooseDocument() {
  closePanels();
  say(T('files.chooseNow'), Infinity, { guide: true });
  const result = await api.filesAction({ op: 'choose' });
  const back = [T('files.menu'), () => { hideBubble(); showPanel('lessons'); }];
  if (result.error) say(T('files.error'), 6000, { guide: true, actions: [back] });
  else if (result.canceled) say(T('files.canceled'), 5000);
  else { say(T('files.opened'), 5000); settings.skills = await api.addSkill(T('files.chooseSkill')); }
}
