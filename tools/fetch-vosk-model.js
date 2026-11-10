// Скачивает маленькую русскую модель Vosk для голосового ввода без интернета (около 40 МБ).
// Запускается сам после npm install. Если не получилось, приложение работает и без голоса.
const fs = require('fs');
const path = require('path');

const URL = process.env.PUSHIK_VOSK_URL
  || 'https://raw.githubusercontent.com/ccoreilly/vosk-browser/gh-pages/models/vosk-model-small-ru-0.4.tar.gz';
const OUT = path.join(__dirname, '..', 'assets', 'vosk', 'model-ru.tar.gz');

(async () => {
  if (fs.existsSync(OUT) && fs.statSync(OUT).size > 1_000_000) { console.log('[pushik] Vosk model is already here'); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  console.log(`[pushik] downloading Vosk model: ${URL}`);
  try {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(`${OUT}.part`, buf);
    fs.renameSync(`${OUT}.part`, OUT);
    console.log(`[pushik] Vosk model saved (${Math.round(buf.length / 1e6)} MB)`);
  } catch (e) {
    console.warn(`[pushik] could not download the Vosk model (${e.message}). Voice input will be off; run "npm run vosk" later.`);
  }
})();
