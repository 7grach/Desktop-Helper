/* Распознавание речи прямо в приложении, без интернета и ключей: Vosk (WebAssembly) с маленькой русской моделью.
   Модель (около 40 МБ) скачивается один раз при npm install в assets/vosk/ и попадает в установщик. */
(function (root) {
  const LIB = '../../node_modules/vosk-browser/dist/vosk.js';
  const MODEL = 'pushik://vosk/model-ru.tar.gz';
  let modelPromise = null;

  function loadLib() {
    if (root.Vosk) return Promise.resolve(root.Vosk);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = () => resolve(root.Vosk);
      s.onerror = () => reject(new Error('vosk.js not found'));
      document.head.appendChild(s);
    });
  }

  // Модель грузится один раз и потом лежит в IndexedDB: следующий запуск быстрее.
  function model() {
    if (!modelPromise) {
      modelPromise = loadLib().then((V) => V.createModel(MODEL)).catch((e) => { modelPromise = null; throw e; });
    }
    return modelPromise;
  }

  /**
   * listen({ onPartial, maxMs }) → { stop(), result: Promise<string> }
   * Слушает микрофон, пока человек не замолчит на 1.8 с после фразы, не нажмёт «стоп» или не пройдёт maxMs.
   */
  async function listen({ onPartial, maxMs = 12000, grammar } = {}) {
    const m = await model();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const ctx = new AudioContext();
    // grammar: список слов, которые ждём. Так маленькая модель почти не ошибается в командах.
    const rec = grammar ? new m.KaldiRecognizer(ctx.sampleRate, JSON.stringify(grammar)) : new m.KaldiRecognizer(ctx.sampleRate);
    const parts = [];
    let partial = '';
    let lastVoice = 0;
    let stopped = false;
    let finish;
    const result = new Promise((r) => { finish = r; });

    rec.on('result', (msg) => {
      const text = msg?.result?.text?.trim();
      if (text) { parts.push(text); lastVoice = performance.now(); }
      if (stopped) done();
    });
    rec.on('partialresult', (msg) => {
      const p = msg?.result?.partial?.trim() || '';
      if (p && p !== partial) { partial = p; lastVoice = performance.now(); onPartial?.([...parts, p].join(' ')); }
    });

    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => { try { rec.acceptWaveform(e.inputBuffer); } catch { /* пропускаем кусок */ } };
    src.connect(node);
    node.connect(ctx.destination);

    const t0 = performance.now();
    const timer = setInterval(() => {
      const t = performance.now();
      if ((lastVoice && t - lastVoice > 1800) || t - t0 > maxMs) stop();
    }, 200);

    let doneOnce = false;
    function done() {
      if (doneOnce) return;
      doneOnce = true;
      clearInterval(timer);
      try { node.disconnect(); src.disconnect(); } catch { /* уже */ }
      stream.getTracks().forEach((tr) => tr.stop());
      ctx.close();
      try { rec.remove(); } catch { /* уже */ }
      const text = parts.join(' ').trim() || partial;
      finish(text);
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      try { rec.retrieveFinalResult(); } catch { done(); }
      setTimeout(done, 1200); // если финальный результат не пришёл
    }
    return { stop, result };
  }

  root.Voice = { model, listen, MODEL };
})(window);
