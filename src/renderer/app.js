/* Пушик: кот-помощник для тех, кто только знакомится с компьютером. Без сборщиков, чистый JS.
   Кот живёт на рабочем столе, смотрит на экран по просьбе человека и показывает лапкой, куда нажать. */

const $ = (s) => document.querySelector(s);
const api = window.pushik || mockApi();
const T = (k, v) => I18N.t(k, v);
const { A: ANIM, dirAnim } = Cats;

const SHEETS = '../../assets/cats/';
const CAT_W = 150;
const CAT_H = 140;
const G = 2200;            // гравитация, px/с²
const catEl = $('#cat');
const bubble = $('#bubble');
const bubbleText = $('#bubble-text');
const bubbleActions = $('#bubble-actions');
const fx = $('#fx');
const badge = $('#focus-badge');
const ring = $('#ring');
const sprite = new Cats.CatSprite($('#sprite'));

let settings = { speed: 1, chatter: false, breakEvery: 0, size: 1, windows: true, sound: true, volume: 0.4, lang: 'ru', catColor: 'white', speak: true, skills: [] };
let reminders = [];

const W = () => window.innerWidth;
const H = () => window.innerHeight;
const size = () => Number(settings.size) || 1;
const floorY = () => H() - CAT_H;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = () => performance.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cx = () => cat.x + CAT_W / 2;                // центр кота по горизонтали
const visTop = () => cat.y + CAT_H * (1 - size()); // верх кота с учётом размера

// ---------- Окна других программ: их верхние края = полки для кота ----------
let winList = [];     // [[id, x, y, w, h]] спереди назад
let platforms = [];   // [{id, x1, x2, y}] видимые куски верхних краёв

function subtract(segs, a, b) {
  const out = [];
  for (const [s, e] of segs) {
    if (b <= s || a >= e) { out.push([s, e]); continue; }
    if (a > s) out.push([s, a]);
    if (b < e) out.push([b, e]);
  }
  return out;
}

function computePlatforms() {
  const out = [];
  const minY = CAT_H * size() + 4;
  const maxY = H() - 80;
  winList.forEach(([id, x, y, w], i) => {
    if (y < minY || y > maxY) return;
    let segs = [[Math.max(0, x), Math.min(W(), x + w)]];
    for (let j = 0; j < i; j++) {
      const [, fx2, fy, fw, fh] = winList[j];
      if (fy <= y + 2 && fy + fh > y - 4) segs = subtract(segs, fx2, fx2 + fw);
    }
    for (const [a, b] of segs) if (b - a >= 110) out.push({ id, x1: a, x2: b, y });
  });
  platforms = out;
}

const platUnder = (id, x) => platforms.find((p) => p.id === id && x >= p.x1 && x <= p.x2);
const currentPlat = () => (cat.plat ? platUnder(cat.plat, cx()) : null);
const groundY = () => { const p = currentPlat(); return p ? p.y - CAT_H : floorY(); };

// ---------- Состояние кота ----------
// Состояния: idle, walk, sleep, act, drag, fall, jump, busy, perch (стоит у кнопки и показывает), intro, outro.
const cat = {
  x: W() * 0.75, y: floorY(), vy: 0,
  dir: -1, state: 'idle', until: now() + 1500, since: now(), targetX: null,
  plat: null, climb: null, jump: null, onArrive: null,
  lastPet: Date.now(), wantsAttention: false, idlePose: 'wagSitF', meowUntil: 0,
};
let openPanel = null;

function setState(state, ms) {
  cat.state = state;
  cat.until = ms ? now() + ms : Infinity;
  cat.since = now();
  if (state !== 'walk') { cat.running = false; cat.onArrive = null; }
  if (state === 'idle') cat.idlePose = pick(['wagSitF', 'wagSitF', 'wagStandF', 'sitTail', 'wagSitB', dirAnim('wagSit', cat.dir), dirAnim('sit', cat.dir)]);
  catEl.classList.toggle('dragging', state === 'drag');
}

function walkTo(centerX, run = false, onArrive = null) {
  cat.targetX = centerX - CAT_W / 2;
  cat.dir = cat.targetX > cat.x ? 1 : -1;
  setState('walk');
  cat.running = run;
  cat.onArrive = onArrive;
}

function startFall() {
  cat.vy = 0;
  cat.plat = null;
  setState('fall');
}

// Прыжок по дуге в точку (центр по x, верх кота по y). plat: на какое окно приземлились.
function jumpTo(centerX, y, plat = null, after = null) {
  const x0 = cat.x;
  const y0 = cat.y;
  const tx = centerX - CAT_W / 2;
  const dist = Math.abs(tx - x0);
  const dur = clamp(0.45 + Math.sqrt(Math.max(0, y0 - y)) / 55 + dist / 2600, 0.45, 1.3);
  cat.jump = { t0: now(), dur, x0, y0, tx, ty: y, vx: (tx - x0) / dur, vy: (y - y0 - 0.5 * G * dur * dur) / dur, plat, after, vertical: dist < 50 };
  if (dist >= 4) cat.dir = tx > x0 ? 1 : -1;
  setState('jump');
}

// Чем кот занимается сам, когда ему скучно. Все анимации из листа.
const ACTS = [
  { anim: () => 'lickSit', text: 'act.grooming' },
  { anim: () => 'lickLie', text: 'act.grooming' },
  { anim: () => dirAnim('scratch', cat.dir) },
  { anim: () => 'yawn', text: 'act.yawn', ms: 1400 },
  { anim: () => pick(['eatF', 'eatB', dirAnim('eat', cat.dir)]), text: 'act.eating' },
  { anim: () => dirAnim('wagLie', cat.dir), text: 'act.rolling' },
  { anim: () => pick(['swipeSitF', 'swipeSitF2', dirAnim('swipeSit', cat.dir), `${dirAnim('swipeSit', cat.dir)}2`]), text: 'act.playing' },
  { anim: () => pick([dirAnim('swipeStand', cat.dir), `${dirAnim('swipeStand', cat.dir)}2`, 'swipeStandF', 'swipeStandF2']), text: 'act.tailChasing' },
  { anim: () => pick(['swipeSitB', 'swipeStandB']), text: 'act.knocking' },
  { anim: () => 'hind', text: 'act.birdWatching' },
  { anim: () => 'wagSitB', text: 'act.back' },
  { anim: () => pick(['wagStandB', 'standB']), text: 'act.back' },
  { anim: () => 'meowLie' },
  { anim: () => pick(['lieL', 'lieR', 'lieF_L', 'lieF_R']) },
];

function decideNext() {
  if (guide.active || trainer.step) return setState(cat.state === 'perch' ? 'perch' : 'busy');
  if (openPanel) return setState('busy');
  const r = Math.random();
  const p = currentPlat();
  // залезть на окно
  if (!p && settings.windows && platforms.length && r < 0.14) {
    const target = pick(platforms);
    const land = rand(target.x1 + 40, target.x2 - 40);
    const side = cx() < land ? -1 : 1;
    const from = clamp(land + side * rand(80, 160), CAT_W / 2, W() - CAT_W / 2);
    cat.climb = { id: target.id, cx: land };
    walkTo(from, Math.abs(from - cx()) > 450);
    const s = T('say.climb');
    if (s && Math.random() < 0.5) say(s, 2000);
    return;
  }
  if (r < 0.5) {
    if (p) {
      const off = Math.random() < 0.2;
      walkTo(off ? pick([p.x1 - 70, p.x2 + 70]) : rand(p.x1 + 25, p.x2 - 25));
      return;
    }
    let goal = rand(20 + CAT_W / 2, W() - CAT_W / 2 - 20);
    if (Math.abs(goal - cx()) < 60) goal = cx() > W() / 2 ? cx() - 200 : cx() + 200;
    walkTo(goal, Math.abs(goal - cx()) > 450 && Math.random() < 0.4);
  } else if (r < 0.68) {
    setState('idle', rand(3000, 9000));
  } else if (r < 0.76) {
    goSleep(rand(30_000, 80_000));
  } else {
    const a = pick(ACTS);
    showPose(a.anim(), a.ms || rand(3500, 7000), a.text && Math.random() < 0.6 ? T(a.text) : '');
  }
}

function goSleep(ms) {
  const kind = pick(['sleep1', 'sleep2', 'sleep3', 'sleep4', 'sleep5', 'sleepBack']);
  cat.sleepKind = dirAnim(kind, cat.dir);
  setState('sleep', ms);
}

// ---------- Главный цикл ----------
let last = now();
let nextZ = 0;
let animName = '';
let animStart = 0;

function tickFrame() {
  const t = now();
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;

  if (cat.plat && !['drag', 'fall', 'jump', 'perch'].includes(cat.state)) {
    const p = currentPlat();
    if (!p) startFall();
    else cat.y = p.y - CAT_H;
  }

  switch (cat.state) {
    case 'walk': {
      const speed = (cat.running ? 190 : 75) * (settings.speed || 1);
      cat.x += cat.dir * speed * dt;
      if ((cat.dir > 0 && cat.x >= cat.targetX) || (cat.dir < 0 && cat.x <= cat.targetX)) {
        cat.x = cat.targetX;
        const climb = cat.climb;
        const arrive = cat.onArrive;
        cat.climb = null;
        const target = climb && platforms.find((p) => p.id === climb.id && climb.cx >= p.x1 && climb.cx <= p.x2);
        if (arrive) { cat.onArrive = null; arrive(); } else if (target) jumpTo(climb.cx, target.y - CAT_H, target.id);
        else setState('idle', rand(2000, 6000));
      }
      break;
    }
    case 'jump': {
      const j = cat.jump;
      const e = (t - j.t0) / 1000;
      if (e >= j.dur) {
        cat.x = j.tx;
        cat.y = j.ty;
        cat.plat = j.plat;
        if (j.plat && !currentPlat()) { startFall(); break; }
        const after = j.after;
        j.after = null; // только один раз, даже если внутри что-то упадёт
        setState('idle', rand(2000, 5000));
        if (after) after();
      } else {
        cat.x = j.x0 + j.vx * e;
        cat.y = j.y0 + j.vy * e + 0.5 * G * e * e;
      }
      break;
    }
    case 'fall': {
      const prevBottom = cat.y + CAT_H;
      cat.vy += G * dt;
      cat.y += cat.vy * dt;
      let floor = floorY();
      let landOn = null;
      if (cat.vy > 0) {
        for (const p of platforms) {
          if (cx() < p.x1 + 10 || cx() > p.x2 - 10) continue;
          if (prevBottom <= p.y + 1 && cat.y + CAT_H >= p.y && p.y - CAT_H < floor) { floor = p.y - CAT_H; landOn = p.id; }
        }
      }
      if (cat.y >= floor) {
        cat.y = floor;
        cat.plat = landOn;
        if (cat.vy > 500) { cat.vy = -cat.vy * 0.3; } else { cat.vy = 0; land(); }
      }
      break;
    }
    case 'sleep':
      if (t - cat.since > 2500 && t > nextZ) { spawnFx('z', pick(['z', 'Z', 'z'])); nextZ = t + 1400; }
      break;
    case 'intro':
    case 'outro': {
      const p = clamp((t - cat.since) / 1600, 0, 1);
      const s = cat.state === 'intro' ? 0.3 + 0.7 * p : 1 - 0.75 * p;
      catEl.style.setProperty('--s', s.toFixed(3));
      if (p >= 1) {
        catEl.style.setProperty('--s', '1');
        const done = cat.onDone;
        cat.onDone = null;
        setState('idle', rand(2000, 4000));
        if (done) done();
      }
      break;
    }
    default:
      break;
  }

  if (cat.plat && cat.state === 'walk' && !currentPlat()) startFall();

  if (t > cat.until) {
    if (cat.state === 'sleep') { say(T('say.wake'), 2500); void 0; showPose('yawn', 1400); } else decideNext();
  }

  render(t);

  const k = size();
  const pad = (CAT_W * (1 - k)) / 2;
  cat.x = clamp(cat.x, -pad, W() - CAT_W + pad);
  if (!['drag', 'fall', 'jump', 'perch'].includes(cat.state)) cat.y = Math.min(cat.y, groundY());
  catEl.style.transform = `translate(${Math.round(cat.x)}px, ${Math.round(cat.y)}px)`;
  updateBadge();
}

// Одна ошибка в кадре не должна останавливать кота: иначе он замирает посреди прыжка, а облачко не появляется.
function tick() {
  if (!bubble.classList.contains('hidden')) { try { placeBubble(); } catch { /* пусто */ } }
  try { tickFrame(); } catch (err) { console.error('tick', err); }
  requestAnimationFrame(tick);
}

function land() {
  if (cat.afterLand) { const f = cat.afterLand; cat.afterLand = null; setState('idle', rand(1500, 3000)); f(); return; }
  if (trainer.step === 'landing') { trainerDone(); return; }
  setState('idle', rand(1500, 3000));
  if (Math.random() < 0.5) { say(T('say.land'), 2200); if (Math.random() < 0.5) void 0; }
}

// Какую анимацию показать сейчас. Возвращает имя анимации или конкретный кадр {row, col}.
function pickAnim(t) {
  const d = cat.dir;
  if (catEl.classList.contains('happy')) return 'hind';
  if (cat.lookUntil && t < cat.lookUntil) return cat.lookPose;
  const talking = t < cat.meowUntil;
  switch (cat.state) {
    case 'walk': return dirAnim(cat.running ? 'run' : 'walk', d);
    case 'intro': return cat.introRun ? 'runDown' : 'walkDown';
    case 'outro': return 'walkUp';
    case 'sleep': {
      const e = t - cat.since;
      if (e < 1200) return 'yawn';
      if (e < 2400) return d < 0 ? 'lieF_L' : 'lieF_R';
      return cat.sleepKind || 'sleep1L';
    }
    case 'drag': return 'meowStand';
    case 'fall': return cat.vy < 0 ? { row: ANIM.jumpB.row, col: 1 } : { row: ANIM[dirAnim('jump', d)].row, col: 2 };
    case 'jump': {
      const j = cat.jump;
      const p = (t - j.t0) / 1000 / j.dur;
      if (j.vertical) return { row: ANIM.jumpB.row, col: p < 0.5 ? 1 : 2 };
      return { row: ANIM[dirAnim('jump', d)].row, col: p < 0.12 ? 1 : p < 0.85 ? 2 : 3 };
    }
    case 'act': return cat.act;
    case 'perch': {
      if (catEl.classList.contains('thinking')) return 'wagStandB';
      if (talking) return 'meowStand';
      // показываем лапкой на кнопку, потом немного ждём, виляя хвостом
      const e = (t - cat.since) % 3600;
      return e < 1800 ? dirAnim('swipeStand', d) : dirAnim('wagStand', d);
    }
    default: {
      if (catEl.classList.contains('thinking')) return 'wagSitB'; // повернулся к экрану и смотрит
      if (talking) return 'meowSit';
      if (cat.state === 'busy') return 'wagSitF';
      if (t - cat.since > 2500 && cat.wantsAttention) return 'hind';
      return t - cat.since > 2000 ? cat.idlePose : dirAnim('wagStand', d);
    }
  }
}

function render(t) {
  const a = pickAnim(t);
  if (typeof a === 'string') {
    if (a !== animName) { animName = a; animStart = t; }
    const ended = sprite.draw(a, t - animStart);
    // одноразовая анимация (зевок) закончилась: садимся
    if (ended && cat.state === 'act') { cat.act = 'sitF'; }
  } else {
    animName = '';
    sprite.frame(a.row, a.col);
  }
}

// ---------- Реплики, позы, эффекты ----------
let bubbleTimer = null;
// say(text, ms, { actions: [[label, fn, primary?]], guide, danger, explain })
function say(text, ms = 4000, opts = {}) {
  if (!text) return;
  // пока кот ведёт по шагам, случайные фразы («Оп! Приземлился») не закрывают подсказку
  if (guide.active && !opts.guide && ms <= 4500) return;
  bubbleText.textContent = text;
  if (opts.explain) {
    const p = document.createElement('div');
    p.className = 'explain';
    p.textContent = opts.explain;
    bubbleText.appendChild(p);
  }
  bubbleActions.innerHTML = '';
  for (const [label, fn, primary] of opts.actions || []) {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    bubbleActions.appendChild(b);
  }
  bubble.classList.toggle('guide', !!(opts.guide || opts.actions));
  bubble.classList.toggle('danger', !!opts.danger);
  bubble.classList.remove('hidden', 'below');
  bubble.scrollTop = 0;
  cat.meowUntil = now() + 800;
  placeBubble();
  clearTimeout(bubbleTimer);
  if (Number.isFinite(ms)) bubbleTimer = setTimeout(hideBubble, ms);
}
function hideBubble() {
  clearTimeout(bubbleTimer);
  bubble.classList.add('hidden');
  bubbleActions.innerHTML = '';
}
// Общая логика для Mac и Windows: координаты уже в DIP окна Пушика.
// Пересчитываем сторону карточки при движении, иначе «снизу» остаётся после прыжка вниз.
// offsetHeight не учитывает анимацию появления. Если места мало — ограничиваем экраном.
// Границы переноса между ОС описаны в docs/guide-porting.md.
function placeBubble() {
  const width = bubble.offsetWidth;
  const height = bubble.offsetHeight;
  const above = cat.y + CAT_H - 128 * size() - height;
  const belowTop = cat.y + CAT_H + 14;
  const below = above < 8 && belowTop + height <= H() - 8;
  bubble.classList.toggle('below', below);
  const top = below ? belowTop : above;
  const left = cat.x + CAT_W / 2 - width / 2;
  const dx = clamp(left, 8, Math.max(8, W() - width - 8)) - left;
  const dy = clamp(top, 8, Math.max(8, H() - height - 8)) - top;
  bubble.style.marginLeft = '0px';
  bubble.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
  bubble.classList.toggle('detached', Math.abs(dy) > 1);
}

// Поза на время ms. Старые имена поз из прошлых версий переведены на новые анимации.
const POSE_ALIAS = { happy: 'hind', wave: 'meowStand', coffee: 'eatF', angry: null, headpat: 'meowSit', blush: 'lickSit' };
function showPose(name, ms = 4000, text) {
  let a = name in POSE_ALIAS ? POSE_ALIAS[name] : name;
  if (name === 'angry') a = dirAnim('hiss', cat.dir);
  cat.act = ANIM[a] ? a : 'sitF';
  setState('act', ms);
  if (text) say(text, ms);
}

function spawnFx(kind, ch) {
  const s = document.createElement('span');
  s.className = kind;
  s.textContent = ch;
  s.style.left = `${75 + rand(-20, 20)}px`;
  s.style.top = `${kind === 'z' ? rand(40, 55) : rand(10, 30)}px`;
  s.style.setProperty('--dx', `${rand(-25, 25)}px`);
  fx.appendChild(s);
  setTimeout(() => s.remove(), 1700);
}

function happy(ms = 1200) {
  catEl.classList.add('happy');
  setTimeout(() => catEl.classList.remove('happy'), ms);
}

function celebrate() {
  happy(1800);
  for (let i = 0; i < 8; i++) setTimeout(() => spawnFx('h', pick(['⭐', '🎉', '💛', '✨'])), i * 140);
  void 0;
  setTimeout(() => Sound.purr(1.5), 500);
}

function pet() {
  showPose(pick(['hind', 'meowSit', 'lickSit']), 2500);
  cat.wantsAttention = false;
  for (let i = 0; i < 5; i++) setTimeout(() => spawnFx('h', pick(['💛', '🤍', '💛'])), i * 150);
  say(T('say.pet'), 2500);
  Sound.purr(2.4);
  cat.lastPet = Date.now();
}

// ---------- Голос кота: читаем подсказки вслух ----------
function speak(text) {
  if (!settings.speak || !('speechSynthesis' in window) || !text) return;
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}☀-➿️*«»]/gu, '').trim();
  if (!clean) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  const lang = settings.lang === 'en' ? 'en' : 'ru';
  u.lang = lang === 'en' ? 'en-US' : 'ru-RU';
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
  if (voice) u.voice = voice;
  u.rate = Number(settings.voiceRate) || 0.95;
  u.pitch = 1.15;
  speechSynthesis.speak(u);
}

// ---------- Помощник: снимок экрана → кот показывает лапкой ----------
const guide = { active: false, goal: '', history: [], last: null, busy: false, idleTimer: null, mode: '' };

function showRing(t) {
  if (!t) { hideRing(); return; }
  const pad = 6;
  // рамку держим в пределах экрана: у развёрнутых окон края уходят за экран
  const x1 = Math.max(2, t.x - pad);
  const y1 = Math.max(2, t.y - pad);
  const x2 = Math.min(W() - 2, t.x + t.w + pad);
  const y2 = Math.min(H() - 2, t.y + t.h + pad);
  if (x2 - x1 < 8 || y2 - y1 < 8) { hideRing(); return; }
  Object.assign(ring.style, {
    left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px`,
  });
  ring.classList.remove('hidden');
}
function hideRing() { ring.classList.add('hidden'); }

// Кот подходит (подпрыгивает) к кнопке и встаёт сбоку, лапкой к ней.
let pointGazeTimer=null;
function cancelPointGaze(){clearTimeout(pointGazeTimer);cat.lookUntil=0;}
function goPoint(t, then) {
  if (cat.state === 'drag') { if (then) then(); return; }
  cancelPointGaze();
  const dx=t.x+t.w/2-cx(),dy=t.y+t.h/2-(cat.y+CAT_H/2);
  cat.dir=dx>=0?1:-1;
  cat.lookPose=Math.abs(dx)<70?(dy<0?'standB':'standF'):(dx<0?'standL':'standR');
  cat.lookUntil=now()+320;
  setState('busy');
  pointGazeTimer=setTimeout(()=>{
    if(cat.state!=='busy'||!cat.lookUntil)return;
    cat.lookUntil=0;moveToPoint(t,then);
  },320);
}
function moveToPoint(t, then) {
  const k = size();
  const half = 52 * k;                       // половина видимой ширины кота
  const right = t.x + t.w / 2 > W() / 2;     // кнопка справа: кот встаёт слева от неё
  let center = right ? t.x - half - 6 : t.x + t.w + half + 6;
  // не влезает сбоку: встаём под кнопкой
  if (center < half || center > W() - half) center = clamp(t.x + t.w / 2, half, W() - half);
  const facing = center < t.x + t.w / 2 ? 1 : -1;
  const feet = clamp(t.y + t.h / 2 + 45 * k, 115 * k, H());
  let y = feet - CAT_H;
  const done = () => {
    // подсказку уже отменили, пока кот прыгал: не остаёмся висеть наверху
    if (!guide.active) { startFall(); return; }
    cat.dir = facing; setState('perch'); if (then) then();
  };
  if (y > floorY() - 40) {
    // кнопка внизу экрана: просто идём по полу
    y = floorY();
    if (cat.state === 'perch' || cat.plat) { jumpTo(center, y, null, done); return; }
    if (Math.abs(center - cx()) < 8) { done(); return; }
    walkTo(center, Math.abs(center - cx()) > 400, done);
    return;
  }
  jumpTo(center, y, null, done);
}

function guideMasks() {
  const rects = [$('#sprite'), bubble, ring, badge].filter((el) => !el.classList.contains('hidden'))
    .map((el) => el.getBoundingClientRect());
  return rects.map((r) => ({ x: Math.round(r.left - 12), y: Math.round(r.top - 12), w: Math.round(r.width + 24), h: Math.round(r.height + 24) }));
}

function startWatch() {
  api.guideUnwatch();
  // ждём, пока кот допрыгнет и облачко встанет на место
  setTimeout(() => { if (guide.active && !guide.busy) api.guideWatch(guideMasks()); }, 900);
  clearTimeout(guide.idleTimer);
  guide.stepAt = Date.now();
  guide.autoChecked = false;
}

function aiStepActions() {
  const actions = [
    [T('g.done'), () => look('check'), true],
    [T('g.again'), () => showStep(guide.last, true)],
    [T('g.stop'), () => endGuide(true)],
  ];
  if(guide.last?.whatChanged) actions.splice(1,0,['Что сейчас произошло?',()=>showChange(guide.last.whatChanged,()=>showStep(guide.last,true))]);
  return actions;
}
function showChange(text,back){
  say(text,Infinity,{guide:true,actions:[['Повторить',()=>speak(text)],['Назад',back],['Завершить',()=>endGuide(false)]]});
  speak(text);
}

function showStep(res, repeat = false) {
  guide.last = res;
  showRing(res.target);
  const sayIt = () => {
    say(res.say, Infinity, { actions: aiStepActions(), guide: true });
    speak(res.say);
    startWatch();
  };
  if (res.target) goPoint(res.target, sayIt);
  else { setState('busy'); sayIt(); }
  if (repeat) void 0;
}

async function look(mode) {
  if (guide.busy) return;
  guide.busy = true;
  guide.mode = mode;
  api.guideUnwatch();
  clearTimeout(guide.idleTimer);
  speechSynthesis?.cancel?.();
  hideRing();
  catEl.classList.add('thinking');
  if (cat.state !== 'perch' && !['fall', 'jump'].includes(cat.state)) setState('busy');
  say(T(mode === 'check' ? 'g.checking' : 'g.looking'), Infinity, { guide: true });
  const res = await api.guideLook({ mode, goal: guide.goal, history: guide.history, previousSummary: guide.screenSummary || '' });
  catEl.classList.remove('thinking');
  guide.busy = false;
  if (!guide.active) return;
  if (res.error) {
    say(res.error, Infinity, { actions: [[T('g.retry'), () => look(mode), true], [T('g.stop'), () => endGuide(true)]], guide: true });
    speak(res.error);
    return;
  }
  if(res.screenSummary) guide.screenSummary=res.screenSummary;
  const s = res.status;
  if (s === 'step') {
    if (res.say) guide.history.push(res.say);
    showStep(res);
  } else if (s === 'done') {
    hideRing();
    const skill = res.skill || guide.goal;
    const completion = `${res.say || T('g.success')}\n${T('g.skillSaved')}`;
    const doneActions = res.whatChanged ? [['Что сейчас произошло?',()=>showChange(res.whatChanged,()=>say(completion,Infinity,{guide:true,actions:[['Закрыть',()=>endGuide(false)]]}))],['Закрыть',()=>endGuide(false)]] : [];
    say(completion, doneActions.length ? Infinity : 7000, { guide: true, actions:doneActions });
    speak(res.say || T('g.success'));
    celebrate();
    if (skill) settings.skills = await api.addSkill(skill);
    guide.active = false;
    setTimeout(() => { if (cat.state === 'perch') startFall(); }, 2500);
  } else if (s === 'explain' || s === 'danger') {
    showRing(res.target);
    const go = () => { if (guide.goal) look('check'); else endGuide(false); };
    const opts = { actions: [[T('g.ok'), go, true], [T('g.stop'), () => endGuide(true)]], guide: true, explain: res.explain, danger: s === 'danger' };
    const text = s === 'danger' ? `${T('g.danger')} ${res.say}` : res.say;
    const show = () => { say(text, Infinity, opts); speak(`${res.explain || ''} ${res.say}`); };
    if (s === 'danger') { Sound.hiss(); }
    if (res.target) goPoint(res.target, show); else show();
    if (s === 'danger') setTimeout(() => { if (cat.state !== 'perch') showPose('angry', 1600); }, 50);
  } else {
    hideRing();
    say(res.say || T('g.notFound'), Infinity, { actions: [[T('g.retry'), () => look(guide.history.length ? 'check' : 'start'), true], [T('g.stop'), () => endGuide(true)]], guide: true });
    speak(res.say || T('g.notFound'));
  }
}

function startGuide(goal) {
  goal = String(goal || '').trim();
  if (!goal) return;
  closePanels();
  endTrainer();
  guide.active = true;
  guide.kind = 'ai';
  guide.goal = goal;
  guide.history = [];
  guide.screenSummary = '';
  guide.last = null;
  look('start');
}

function imLost() {
  closePanels();
  endTrainer();
  if (!guide.active) { guide.goal = ''; guide.history = []; guide.kind = 'ai'; }
  guide.active = true;
  guide.busy = false;
  look('confused');
}

function endGuide(sayBye) {
  cancelPointGaze();
  guide.active = false;
  guide.last = null;
  api.guideUnwatch();
  clearTimeout(guide.idleTimer);
  speechSynthesis?.cancel?.();
  hideRing();
  hideBubble();
  catEl.classList.remove('thinking');
  if (sayBye) say(T('g.bye'), 2500);
  if (cat.state === 'perch') startFall();
  else if (cat.state === 'busy' && !openPanel) setState('idle', 3000);
}

// экран заметно поменялся после подсказки: сами проверяем, получилось ли
// бесплатный ИИ попросил подождать: кот говорит, что думает, вместо тишины
api.on('ai-wait', (sec) => say(T('ai.wait', { sec }), (sec + 1) * 1000, { guide: true }));

// Сам проверяем не больше одного раза на шаг и не раньше чем через 3 с:
// иначе любое движение на экране (видео, прокрутка) заставляет кота говорить без спроса.
api.on('screen-changed', () => {
  if (!guide.active || guide.busy || guide.kind !== 'ai' || guide.mode === 'confused') return;
  if (guide.autoChecked || Date.now() - (guide.stepAt || 0) < 3000) return;
  guide.autoChecked = true;
  api.guideUnwatch();
  setTimeout(() => { if (guide.active && !guide.busy) look('check'); }, 1200);
});

// ---------- Тренажёр мыши (F8): знакомство на самом коте ----------
const trainer = { step: null };
function startTrainer() {
  closePanels();
  if (guide.active) endGuide(false);
  trainer.step = 'click';
  if (cat.plat || cat.state === 'perch') { cat.afterLand = () => trainerSay('tr.click'); startFall(); return; }
  setState('busy');
  trainerSay('tr.click');
}
function trainerSay(key) {
  say(T(key), Infinity, { guide: true, actions: [[T('g.stop'), () => endTrainer(true)]] });
  speak(T(key));
}
async function trainerDone() {
  trainer.step = null;
  setState('idle', 5000);
  celebrate();
  say(`${T('tr.done')}\n${T('g.skillSaved')}`, 8000, { guide: true });
  speak(T('tr.done'));
  settings.skills = await api.addSkill(T('tr.skill'));
  if (!settings.onboarded) {
    settings = await api.saveSettings({ onboarded: true });
    setTimeout(() => { if (!guide.active && !trainer.step) startTourOnce(); }, 6000);
  }
}
function endTrainer(sayBye) {
  if (!trainer.step) return;
  trainer.step = null;
  hideBubble();
  if (sayBye) say(T('g.bye'), 2000);
  if (!settings.onboarded) api.saveSettings({ onboarded: true }).then((s) => { settings = s; });
  if (cat.state === 'busy') setState('idle', 3000);
}

// ---------- Мышь: клики сквозь окно, перетаскивание ----------
let ignoring = true;
function setIgnore(v) {
  if (v === ignoring) return;
  ignoring = v;
  api.setIgnoreMouse(v);
}

let press = null;
document.addEventListener('mousemove', (e) => {
  if (press) {
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) > 5) {
      press.moved = true;
      cancelPointGaze();
      // кота взяли: окна и подсказки прячем, чтобы не мешали
      if (!trainer.step) { closePanels(); if (!guide.active) hideBubble(); }
      cat.plat = null;
      cat.climb = null;
      cat.jump = null;
      setState('drag');
      void 0;
    }
    if (press.moved) {
      cat.x = press.catX + dx;
      cat.y = press.catY + dy;
    }
    return;
  }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  setIgnore(!(el && el.closest('.hit')));
});

catEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.target.closest('.bubble')) return;
  e.preventDefault();
  press = { x: e.clientX, y: e.clientY, catX: cat.x, catY: cat.y, moved: false };
});

document.addEventListener('mouseup', () => {
  if (!press) return;
  const wasDrag = press.moved;
  press = null;
  if (wasDrag) {
    if (trainer.step === 'drag' || trainer.step === 'landing') { trainer.step = 'landing'; hideBubble(); }
    else if (guide.active) {
      // Перенос не завершает сценарий: perch удерживает кота, а текущий шаг сохраняется.
      // Одинаковое поведение на Mac и Windows; падение здесь снова спрятало бы подсказку.
      cat.jump = null;
      cat.plat = null;
      cat.vy = 0;
      cat.y = clamp(cat.y, 0, Math.max(0, floorY()));
      setState('perch');
      if (guide.kind === 'script') resumeCoachAfterDrag();
      else if (guide.last?.say) say(guide.last.say, Infinity, { guide: true, actions: aiStepActions() });
      placeBubble();
      return;
    }
    startFall();
  } else onCatClick();
});

catEl.addEventListener('dblclick', (e) => {
  if (e.target.closest('.bubble') || guide.active) return;
  if (trainer.step === 'dbl') {
    pet();
    trainer.step = 'drag';
    setTimeout(() => trainer.step === 'drag' && trainerSay('tr.drag'), 1600);
    return;
  }
  if (trainer.step) return;
  pet();
});

let clicks = [];
function onCatClick() {
  if (trainer.step === 'click') {
    happy(800);
    void 0;
    trainer.step = 'dbl';
    setTimeout(() => trainer.step === 'dbl' && trainerSay('tr.dbl'), 300);
    return;
  }
  if (trainer.step === 'dbl') return;  // ждём двойной клик
  if (trainer.step === 'drag') { say(T('tr.oops'), 2500); return; }
  // много быстрых тыков подряд злят кота
  clicks = clicks.filter((c) => now() - c < 3000);
  clicks.push(now());
  if (clicks.length >= 6) {
    clicks = [];
    closePanels();
    showPose('angry', 2500, T('say.angry'));
    Sound.hiss();
    return;
  }
  // во время подсказки клик по коту ничего не ломает, но всегда даёт выход: повторить или закончить
  if (guide.active) {
    if (guide.busy) return;
    const acts = guide.kind === 'ai' && guide.last ? aiStepActions()
      : guide.kind === 'script' && coach.active && coach.steps[coach.i] ? coachStepActions(coach.steps[coach.i])
      : [[T('g.stop'), () => endGuide(true), true]];
    say(guide.last?.say || T('g.stopAsk'), Infinity, { actions: acts, guide: true });
    return;
  }
  if (cat.state === 'sleep') {
    setState('idle', 4000);
    say(T('say.notSleeping'), 2000);
  }
  if (cat.state === 'walk') { cat.climb = null; setState('idle', 6000); }
  hideBubble();
  Sound.meow();
  if (openPanel === 'help') closePanels();
  else { showPanel('help'); }
}

// ---------- Окно «Чем помочь?» ----------
// «📞 Позвонить по видео» → «Позвонить по видео»
const goalOf = (label) => label.replace(/^[^\p{L}\p{N}]+/u, '').trim();

// Главное окно: «Я запутался», голос и текст. Готовые задачи живут в «Уроках».
function renderHelp() {
  $('#mic-state').classList.add('hidden');
  document.querySelector('.extras [data-act="chat"]').classList.toggle('hidden', !settings.aiReady);
  initMic();
}

$('#ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#ask-input').value.trim();
  if (!text) { $('#ask-input').focus(); return; }
  $('#ask-input').value = '';
  routeGoal(text);
});

document.querySelector('.extras').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const act = b.dataset.act;
  if (['chat', 'settings', 'lessons'].includes(act)) showPanel(act);
});

// ---------- Голосовой ввод (Whisper). Без микрофона или ключа кнопка просто прячется ----------
let recorder = null;
let recTimer = null;
async function initMic() {
  const btn = $('#mic');
  let hasMic = false;
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices();
    hasMic = !!devices?.some((d) => d.kind === 'audioinput');
  } catch { hasMic = false; }
  btn.classList.toggle('hidden', !(hasMic && (useWhisper() || settings.hasVosk)));
  if (!vosk && !recorder) micButton(false);
}

// Большая кнопка «Сказать задачу» / «Остановить запись»
function micButton(recording) {
  const btn = $('#mic');
  btn.innerHTML = PushikIcon(recording ? 'close' : 'mic');
  const label = document.createElement('span');
  label.textContent = T(recording ? 'help.micStop' : 'help.mic');
  btn.append(label);
  btn.setAttribute('aria-pressed', String(recording));
  btn.classList.toggle('rec', recording);
}
navigator.mediaDevices?.addEventListener?.('devicechange', initMic);

function micState(text) {
  const el = $('#mic-state');
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

// голос: офлайн Vosk (по умолчанию) или Whisper по ключу, если его выбрали в настройках
const useWhisper = () => settings.voice === 'whisper' && settings.hasStt;
let vosk = null;
async function listenOffline() {
  if (vosk) { vosk.stop(); return; }
  const btn = $('#mic');
  try {
    micState(T('mic.loading'));
    vosk = await Voice.listen({
      grammar: Scenarios.grammar(settings.contact || ''),
      onPartial: (p) => { $('#ask-input').value = p.replace(/\[unk\]/g, '').trim(); },
    });
  } catch (err) {
    vosk = null;
    micState(T(err && err.name === 'NotFoundError' ? 'mic.none' : err && err.name === 'NotAllowedError' ? 'mic.denied' : 'mic.noModel'));
    if (err && /NotFound|NotAllowed/.test(err.name)) btn.classList.add('hidden');
    return;
  }
  micButton(true);
  micState(T('mic.rec'));
  const text = (await vosk.result).replace(/\[unk\]/g, '').replace(/\s+/g, ' ').trim();
  vosk = null;
  micButton(false);
  if (!text) { micState(T('mic.empty')); return; }
  micState('');
  $('#ask-input').value = text;
  routeGoal(text);
}

$('#mic').addEventListener('click', async () => {
  if (!useWhisper()) { await api.askMic(); listenOffline(); return; }
  if (recorder) { if (recorder.state === 'recording') recorder.stop(); return; }
  await api.askMic();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    micState(T(err && err.name === 'NotFoundError' ? 'mic.none' : 'mic.denied'));
    $('#mic').classList.add('hidden');
    return;
  }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  const chunks = [];
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    clearTimeout(recTimer);
    stream.getTracks().forEach((tr) => tr.stop());
    micButton(false);
    const type = recorder.mimeType || 'audio/webm';
    recorder = null;
    const blob = new Blob(chunks, { type });
    if (blob.size < 1500) { micState(T('mic.empty')); return; }
    micState(T('mic.wait'));
    const res = await api.transcribe(await blob.arrayBuffer(), type);
    if (res.error) { micState(res.error); return; }
    if (!res.text) { micState(T('mic.empty')); return; }
    micState('');
    $('#ask-input').value = res.text;
    routeGoal(res.text);
  };
  recorder.start();
  micButton(true);
  micState(T('mic.rec'));
  recTimer = setTimeout(() => recorder?.stop(), 15_000);
});

// ---------- Панели ----------
// «Назад» возвращает в окно, из которого пришли (по умолчанию в главное), а не только закрывает всё крестиком.
const panelFrom = {};
function goBack() {
  const to = panelFrom[openPanel] || 'help';
  closePanels();
  showPanel(to);
}
function addBackButtons() {
  document.querySelectorAll('.panel').forEach((p) => {
    const h = p.querySelector(':scope > header');
    if (!h || p.id === 'panel-help' || h.querySelector('.back')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon back';
    b.title = T('back');
    b.setAttribute('aria-label', T('back'));
    b.innerHTML = typeof PushikIcon === 'function' ? PushikIcon('back') : '←';
    b.addEventListener('click', (e) => { e.stopPropagation(); goBack(); });
    h.prepend(b);
  });
}
function showPanel(name) {
  addBackButtons();
  if (name !== openPanel) panelFrom[name] = openPanel && openPanel !== name ? openPanel : 'help';
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  const panel = $(`#panel-${name}`);
  panel.classList.remove('hidden');
  openPanel = name;
  if (!['act', 'fall', 'drag', 'jump', 'perch'].includes(cat.state)) setState('busy');
  if (name === 'help') renderHelp();
  if (name === 'reminders') { renderReminders(); renderCalendar(); setTimeout(() => $('#rem-text').focus(), 50); }
  if (name === 'settings') fillSettings();
  if (name === 'lessons') renderLessons();
  placePanel(panel);
  if (name === 'chat') setTimeout(() => $('#chat-input').focus(), 50);
}

function placePanel(panel) {
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  const top0 = visTop() + 30 * size();
  let left = cx() - pw / 2;
  let top = top0 - ph - 16;
  if (top < 8) {
    // сверху не влезает, ставим сбоку от кота
    top = Math.max(8, Math.min(H() - ph - 8, cat.y + CAT_H - ph));
    const half = (CAT_W * size()) / 2;
    left = cx() + half + 14 + pw < W() ? cx() + half + 14 : cx() - half - pw - 14;
  }
  panel.style.left = `${Math.max(8, Math.min(W() - pw - 8, left))}px`;
  panel.style.top = `${Math.max(8, Math.min(H() - ph - 12, top))}px`;
}

function closePanels() {
  // настройки закрыли без «Сохранить»: возвращаем, как было (размер кота и масштаб показываются сразу при выборе)
  if (openPanel === 'settings') {
    catEl.style.setProperty('--k', settings.size || 1);
    applyWindowScale(settings.uiScale);
  }
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  openPanel = null;
  if (recorder) recorder.stop();
  if (cat.state === 'busy' && !guide.active && !trainer.step) setState('idle', rand(1500, 4000));
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closePanels));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (openPanel) closePanels();
  else if (guide.active) endGuide(true);
  else if (trainer.step) endTrainer(true);
});

// Keep expanding panels inside the work-area viewport, including details and chat replies.
let panelLayoutFrame=0;
function schedulePanelLayout(){
  if(panelLayoutFrame)return;
  panelLayoutFrame=requestAnimationFrame(()=>{
    panelLayoutFrame=0;
    if(!openPanel)return;
    const panel=$('#panel-'+openPanel);
    if(panel&&!panel.classList.contains('hidden'))placePanel(panel);
  });
}
const panelSizeObserver=new ResizeObserver(schedulePanelLayout);
document.querySelectorAll('.panel').forEach(panel=>panelSizeObserver.observe(panel));
document.addEventListener('toggle',e=>{if(e.target.closest?.('.panel'))schedulePanelLayout();},true);
window.addEventListener('resize',schedulePanelLayout);

// ---------- Чат ----------
const log = $('#chat-log');
function addMsg(cls, text) {
  const d = document.createElement('div');
  d.className = `msg ${cls}`;
  d.textContent = text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMsg('me', text);
  const typing = addMsg('from-cat typing', T('chat.thinking'));
  catEl.classList.add('thinking');
  const res = await api.chat(text);
  catEl.classList.remove('thinking');
  typing.remove();
  if (res.error) {
    addMsg('err', res.error);
    return;
  }
  addMsg('from-cat', res.reply);
  happy(800);
  if (res.actions?.length) refreshReminders();
});
document.querySelector('[data-reset]').addEventListener('click', async () => {
  await api.resetChat();
  log.innerHTML = '';
  addMsg('from-cat', T('chat.fresh'));
});

// ---------- Напоминания ----------
const fmtLeft = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

async function refreshReminders() {
  reminders = await api.listReminders();
  if (openPanel === 'reminders') renderReminders();
}

function emptyLi(ul, text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  ul.appendChild(li);
}

function renderReminders() {
  const ul = $('#rem-list');
  ul.innerHTML = '';
  if (!reminders.length) { emptyLi(ul, T('rem.empty')); return; }
  [...reminders].sort((a, b) => a.at - b.at).forEach((r) => {
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.className = 't';
    t.dataset.at = r.at;
    t.textContent = fmtLeft(r.at - Date.now());
    const txt = document.createElement('span');
    txt.textContent = (r.kind === 'focus' ? '🎯 ' : '') + r.text;
    const x = document.createElement('button');
    x.className = 'icon x';
    x.title = T('rem.cancel');
    x.textContent = '✕';
    x.onclick = async () => { await api.cancelReminder(r.id); refreshReminders(); };
    li.append(t, txt, x);
    ul.appendChild(li);
  });
}
setInterval(() => {
  document.querySelectorAll('#rem-list .t').forEach((t) => { t.textContent = fmtLeft(Number(t.dataset.at) - Date.now()); });
}, 1000);

$('#rem-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#rem-text').value.trim();
  const min = Number($('#rem-min').value);
  if (!text || !(min > 0)) return;
  await api.addReminder(min, text, 'reminder');
  $('#rem-text').value = '';
  await refreshReminders();
  happy();
  say(T('rem.saved', { min }), 2500);
});
document.querySelectorAll('.chips button').forEach((b) => b.addEventListener('click', () => { $('#rem-min').value = b.dataset.min; }));

async function startFocus(min) {
  await api.addReminder(min, T('say.focusEnd', { min }), 'focus');
  await refreshReminders();
  showPose('wave', 2500, T('say.focus', { min }));
}

function updateBadge() {
  const f = reminders.filter((r) => r.kind === 'focus').sort((a, b) => a.at - b.at)[0];
  if (!f) { badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  badge.textContent = `🎯 ${fmtLeft(f.at - Date.now())}`;
}

const busyWithPerson = () => guide.active || trainer.step;

api.on('reminder', (r) => {
  refreshReminders();
  if (busyWithPerson()) { Sound.bell(); return; }
  if (cat.state === 'sleep' || cat.state === 'drag') setState('idle', 8000);
  happy(1000);
  Sound.bell();
  if (r.kind === 'focus') showPose('coffee', 8000, `${r.text} ☕`);
  else { showPose('wave', 6000); say(`⏰ ${r.text}`, 15_000); }
});
api.on('reminders-changed', (list) => {
  reminders = list;
  if (openPanel === 'reminders') renderReminders();
});

// ---------- Календарь ----------
async function renderCalendar() {
  const ul = $('#cal-list');
  const res = await api.listCalendar(2);
  ul.innerHTML = '';
  if (!res.connected) { emptyLi(ul, T('cal.off')); return; }
  if (res.error) { emptyLi(ul, T('cal.error', { err: res.error })); return; }
  if (!res.events.length) { emptyLi(ul, T('cal.none')); return; }
  const locale = I18N.lang === 'en' ? 'en-US' : 'ru-RU';
  const today = new Date().toDateString();
  let lastDay = '';
  for (const e of res.events) {
    const d = new Date(e.start);
    const day = d.toDateString() === today || e.start < Date.now() ? T('cal.today') : T('cal.tomorrow');
    if (day !== lastDay) {
      const h = document.createElement('li');
      h.className = 'day';
      h.textContent = day;
      ul.appendChild(h);
      lastDay = day;
    }
    const li = document.createElement('li');
    if (!e.allDay && e.start <= Date.now() && e.end > Date.now()) li.className = 'now';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = e.allDay ? T('cal.allDay') : d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const txt = document.createElement('span');
    txt.textContent = e.title;
    li.append(t, txt);
    ul.appendChild(li);
  }
}

api.on('calendar-soon', (e) => {
  Sound.bell();
  if (busyWithPerson()) return;
  if (cat.state === 'sleep' || cat.state === 'drag') setState('idle', 8000);
  setTimeout(() => void 0, 700);
  showPose('wave', 6000);
  say(e.text, 20_000);
  if (openPanel === 'reminders') renderCalendar();
});
api.on('calendar-changed', () => { if (openPanel === 'reminders') renderCalendar(); });

// ---------- Настройки ----------
const form = $('#settings-form');
function applySettings() {
  I18N.setLang(settings.lang);
  I18N.apply(document);
  refreshPushikIcons();
  applyWindowScale(settings.uiScale);
  catEl.style.setProperty('--k', size());
  sprite.setColor(settings.catColor, SHEETS);
  Sound.set(settings.sound, settings.volume);
  if (!settings.windows) { winList = []; platforms = []; }
  computePlatforms();
}

// Масштаб окон и подсказок 70–140%
function applyWindowScale(value) {
  const scale = Math.min(1.4, Math.max(0.7, Number(value) || 1));
  document.documentElement.style.setProperty('--ui-scale', scale);
  $('#ui-scale-value').textContent = `${Math.round(scale * 100)}%`;
  requestAnimationFrame(() => {
    if (openPanel) placePanel($(`#panel-${openPanel}`));
    if (!bubble.classList.contains('hidden')) placeBubble();
  });
}

// В настройках только то, что понятно новичку. ИИ, ключи и голосовые сервисы задаёт команда в team.json.
const TEXT_FIELDS = ['userName', 'catColor', 'size', 'uiScale'];
const CHECK_FIELDS = ['speak', 'sound', 'autostart'];

async function fillSettings() {
  settings = await api.getSettings();
  for (const k of TEXT_FIELDS) form[k].value = settings[k] ?? '';
  form.uiScale.value = settings.uiScale || 1;
  for (const k of CHECK_FIELDS) form[k].checked = !!settings[k];
  applyWindowScale(settings.uiScale);
}
form.size.addEventListener('input', () => { catEl.style.setProperty('--k', form.size.value); });
form.uiScale.addEventListener('input', () => applyWindowScale(form.uiScale.value));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  settings = await api.saveSettings({
    userName: f.userName.value.trim(),
    catColor: f.catColor.value,
    size: Number(f.size.value) || 1,
    uiScale: Math.min(1.4, Math.max(0.7, Number(f.uiScale.value) || 1)),
    speak: f.speak.checked,
    sound: f.sound.checked,
    autostart: f.autostart.checked,
  });
  applySettings();
  closePanels();
  happy();
  say(T('set.saved'), 2000);
});
$('#quit').addEventListener('click', () => api.quit());
api.on('settings-changed', (s) => { settings = s; applySettings(); });

api.on('windows', (list) => {
  winList = settings.windows ? list : [];
  computePlatforms();
});

// ---------- Команды из трея ----------
api.on('open', (what) => {
  if (what === 'call') {
    closePanels();
    const run = () => { walkTo(W() / 2, true); say(T('say.coming'), 2000); };
    if (cat.plat || cat.state === 'perch') { cat.afterLand = run; startFall(); } else run();
    void 0;
  } else if (what === 'help') {
    if (cat.state === 'sleep') setState('idle', 4000);
    showPanel('help');
  } else if (what === 'trainer') {
    startTrainer();
  } else if (what === 'hide') {
    // уходит вглубь экрана и прячется
    closePanels();
    if (guide.active) endGuide(false);
    const outro = () => { setState('outro'); cat.onDone = () => api.hide(); };
    if (cat.y < floorY() - 2 && !cat.plat) { cat.afterLand = outro; startFall(); } else outro();
  } else if (what === 'show') {
    cat.introRun = true;
    cat.y = floorY();
    cat.plat = null;
    setState('intro');
  } else {
    showPanel(what);
  }
});

// ---------- Забота о человеке ----------
let breakTimer = null;
function resetBreakTimer() {
  clearInterval(breakTimer);
  if (!settings.breakEvery) return;
  breakTimer = setInterval(() => {
    if (reminders.some((r) => r.kind === 'focus') || busyWithPerson()) return;
    if (cat.state === 'sleep') setState('idle', 8000);
    showPose('coffee', 9000, T('say.break', { min: settings.breakEvery }));
    void 0;
  }, settings.breakEvery * 60_000);
}

function scheduleChatter() {
  setTimeout(() => {
    if (settings.chatter && !openPanel && !busyWithPerson() && !['sleep', 'drag', 'jump', 'fall'].includes(cat.state)) {
      if (Date.now() - cat.lastPet > 20 * 60_000 && Math.random() < 0.4) {
        cat.wantsAttention = true;
        setState('idle', 12_000);
        say(T('say.beg'), 4000);
        void 0;
      } else {
        say(T('say.chatter'), 3500);
        if (Math.random() < 0.3) void 0;
      }
    }
    scheduleChatter();
  }, rand(4, 9) * 60_000);
}

function greeting() {
  const h = new Date().getHours();
  const name = settings.userName ? `, ${settings.userName}` : '';
  const key = h < 6 ? 'greet.night' : h < 12 ? 'greet.morning' : h < 18 ? 'greet.day' : 'greet.evening';
  return T(key, { name });
}

// ---------- Старт ----------
window.addEventListener('resize', () => { cat.y = Math.min(cat.y, floorY()); computePlatforms(); });
(async () => {
  settings = await api.getSettings();
  applySettings();
  addMsg('from-cat', T('chat.hello'));
  reminders = await api.listReminders();
  // кот выходит из глубины экрана к человеку
  cat.x = W() * 0.7;
  cat.y = floorY();
  setState('intro');
  cat.onDone = () => {
    void 0;
    if (!settings.onboarded) startTrainer();
    else say(greeting(), 4500);
  };
  resetBreakTimer();
  scheduleChatter();
  requestAnimationFrame(tick);
})();

// Заглушка, чтобы интерфейс можно было открыть в обычном браузере для отладки.
// window.__emit('windows', [[1, 200, 300, 500, 300]]) подсовывает окна.
function mockApi() {
  let list = [];
  const handlers = {};
  window.__emit = (ch, data) => handlers[ch]?.(data);
  const s = {
    speed: 1, chatter: true, breakEvery: 50, size: 1, windows: true, sound: false, volume: 0.4,
    lang: new URLSearchParams(location.search).get('lang') || ((navigator.language || 'ru').startsWith('ru') ? 'ru' : 'en'),
    provider: 'claude', model: 'claude-sonnet-5-5', ollamaUrl: 'http://localhost:11434', ollamaModel: 'qwen3',
    calendarBefore: 10, hasApiKey: true, hasCalendar: true, hasStt: true,
    catColor: new URLSearchParams(location.search).get('color') || 'ginger', speak: false, tasks: [], skills: [],
    onboarded: new URLSearchParams(location.search).has('onboarded'),
    sttUrl: 'https://api.groq.com/openai/v1', sttModel: 'whisper-large-v3', visionModel: '',
    contact: new URLSearchParams(location.search).get('contact') ?? 'Маша', voice: 'offline', hasVosk: true, uiScale: Number(new URLSearchParams(location.search).get('scale')) || 1, aiReady: new URLSearchParams(location.search).has('ai'), locator: true, platform: new URLSearchParams(location.search).get('platform') || 'win32',
  };
  const day = new Date();
  const at = (h, m, plus = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + plus, h, m).getTime();
  // тестовый «помощник»: два шага и успех
  let step = 0;
  const fake = [
    { status: 'step', say: 'Нажми на зелёную трубку внизу экрана', target: { x: 360, y: 300, w: 60, h: 60 } },
    { status: 'step', say: 'Теперь нажми на нужное имя в списке', target: { x: 900, y: 120, w: 220, h: 48 } },
    { status: 'done', say: 'Ура! Звонок пошёл!', skill: 'Позвонить по видео' },
  ];
  return {
    setIgnoreMouse() {},
    getSettings: async () => s,
    saveSettings: async (n) => Object.assign(s, n),
    ollamaModels: async () => ['qwen3', 'llama3.2'],
    chat: async (t) => ({ reply: `Мяу! (тестовый режим) Ты написал: ${t}` }),
    resetChat: async () => true,
    addReminder: async (minutes, text, kind) => { const r = { id: String(Math.random()), at: Date.now() + minutes * 60000, text, kind }; list.push(r); return r; },
    listReminders: async () => list,
    cancelReminder: async (id) => { list = list.filter((r) => r.id !== id); return true; },
    listCalendar: async () => ({
      connected: true,
      events: [
        { title: 'Стендап', start: at(10, 0), end: at(10, 30) },
        { title: 'Обед с командой', start: at(13, 0), end: at(14, 0) },
      ].filter((e) => e.end > Date.now()),
    }),
    guideLook: async ({ mode }) => {
      await new Promise((r) => setTimeout(r, 700));
      if (mode === 'confused') return { status: 'explain', explain: 'Сейчас открыт браузер, страница новостей.', say: 'Нажми на стрелку влево вверху', target: { x: 20, y: 20, w: 40, h: 40 } };
      if (mode === 'start') step = 0; else step++;
      return fake[Math.min(step, fake.length - 1)];
    },
    guideWatch() {},
    guideUnwatch() {},
    // тестовый «рабочий стол»: панель задач с WhatsApp, потом окно WhatsApp с именем контакта и камерой
    locate: async (q) => {
      const t = window.__desk || (window.__desk = { top: { title: 'Рабочий стол', proc: 'explorer', close: { x: 1180, y: 8, w: 40, h: 30 } }, items: {
        taskbar: [{ name: 'WhatsApp', x: 600, y: 680, w: 40, h: 40 }],
      } });
      if (q.op === 'top') return { win: t.top };
      if (q.op === 'drives') return { drives: [] };
      if (q.op === 'volume') return { volume: t.volume ?? 0.3, muted: false };
      const list = (t.items[q.scope] || []).filter((it) => !q.name || new RegExp(q.name, 'i').test(it.name));
      return { items: list };
    },
    filesAction: async ({ op }) => op === 'access' ? { trusted: true } : { ok: true },
    openUri: async () => true,
    openDrive: async () => true,
    transcribe: async () => ({ text: 'Хочу позвонить по видео' }),
    askMic: async () => true,
    addSkill: async (name) => { s.skills = [...s.skills.filter((x) => x.name !== name), { name, at: Date.now() }]; return s.skills; },
    hide() {},
    quit() {},
    on(ch, cb) { handlers[ch] = cb; },
  };
}
