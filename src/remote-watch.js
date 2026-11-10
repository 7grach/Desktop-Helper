// Защита от мошенников без ИИ: замечаем программы удалённого доступа.
// Мошенники часто звонят от имени банка или полиции и просят поставить такую программу,
// чтобы управлять компьютером. Кот спокойно спрашивает, что происходит.
const { execFile } = require('node:child_process');

// Имя процесса (без .exe, в нижнем регистре) → понятное название программы.
const REMOTE_APPS = [
  [/^anydesk/, 'AnyDesk'],
  [/^teamviewer$/, 'TeamViewer'],
  [/^rustdesk/, 'RustDesk'],
  [/^rudesktop/, 'RuDesktop'],
  [/^(aa_v3|ammyy)/, 'Ammyy Admin'],
  [/^aeroadmin/, 'AeroAdmin'],
  [/^supremo/, 'Supremo'],
  [/^ultraviewer/, 'UltraViewer'],
  [/^getscreen/, 'Getscreen'],
  [/^rutserv$|^rfusclient$/, 'RMS (удалённый доступ)'],
  [/^romserver$/, 'LiteManager'],
  [/^quickassist$/, 'Быстрая помощь Windows'],
];

/** Какие программы удалённого доступа есть среди процессов. */
function remoteApps(processes) {
  const found = new Set();
  for (const raw of processes) {
    const name = String(raw).trim().toLowerCase().replace(/\.(exe|app)$/, '');
    const hit = REMOTE_APPS.find(([re]) => re.test(name));
    if (hit) found.add(hit[1]);
  }
  return [...found];
}

/** Имена процессов из вывода tasklist /FO CSV /NH или ps -axco comm. */
function parseProcessList(out, platform = process.platform) {
  const lines = String(out).split(/\r?\n/).filter(Boolean);
  if (platform === 'win32') return lines.map((l) => /^"([^"]+)"/.exec(l)?.[1] ?? '').filter(Boolean);
  return lines.map((l) => l.trim()).filter(Boolean);
}

function listProcesses() {
  const platform = process.platform;
  const [cmd, args] = platform === 'win32' ? ['tasklist', ['/FO', 'CSV', '/NH']] : ['ps', ['-axco', 'comm']];
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      resolve(err ? [] : parseProcessList(String(out), platform));
    });
  });
}

let timers = [];
let seen = new Set();

/** Сообщает о каждой программе, когда она появилась (и сразу, если уже запущена). */
function start(onFound, { everyMs = 8000, initialMs = 3000 } = {}) {
  stop();
  seen = new Set();
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const now = new Set(remoteApps(await listProcesses()));
      for (const app of now) if (!seen.has(app)) onFound(app);
      seen = now; // закрыли и открыли снова — спросим снова
    } finally {
      busy = false;
    }
  };
  timers.push(setInterval(() => { void tick(); }, everyMs));
  timers.push(setTimeout(() => { void tick(); }, initialMs));
}

function stop() {
  for (const timer of timers) {
    clearInterval(timer);
    clearTimeout(timer);
  }
  timers = [];
}

module.exports = { remoteApps, parseProcessList, start, stop };
