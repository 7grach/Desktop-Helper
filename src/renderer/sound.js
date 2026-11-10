/* Звуки Пуша синтезируются на лету (Web Audio), без аудиофайлов. Все тихие. */
(function () {
  let ctx = null;
  let master = null;
  const state = { on: true, volume: 0.4 };
  const lastPlayed = { meow: -Infinity, purr: -Infinity };

  function audio() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = 0.35 * state.volume;
    return ctx;
  }

  function noiseBuffer(sec) {
    const c = audio();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // «Мяу»: пила с плавающим тоном через два фильтра-форманты (м-и-а-у).
  function meow(pitch = 1) {
    if (performance.now() - lastPlayed.meow < 650) return;
    lastPlayed.meow = performance.now();
    const c = audio();
    const t = c.currentTime;
    const len = 0.5 + Math.random() * 0.2;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480 * pitch, t);
    osc.frequency.linearRampToValueAtTime(820 * pitch, t + len * 0.35);
    osc.frequency.linearRampToValueAtTime(430 * pitch, t + len);
    const vib = c.createOscillator();
    const vibGain = c.createGain();
    vib.frequency.value = 6;
    vibGain.gain.value = 12 * pitch;
    vib.connect(vibGain).connect(osc.frequency);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 4;
    f1.frequency.setValueAtTime(700, t);
    f1.frequency.linearRampToValueAtTime(1300, t + len * 0.4);
    f1.frequency.linearRampToValueAtTime(600, t + len);
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.value = 6;
    f2.frequency.value = 2600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.06);
    g.gain.setValueAtTime(0.8, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const mix = c.createGain();
    osc.connect(f1).connect(mix);
    osc.connect(f2).connect(mix);
    mix.connect(g).connect(master);
    osc.start(t); vib.start(t);
    osc.stop(t + len + 0.05); vib.stop(t + len + 0.05);
  }

  // Мурчание: низкий шум, пульсирующий ~25 раз в секунду, вдох-выдох.
  function purr(sec = 2.2) {
    if (performance.now() - lastPlayed.purr < 1200) return;
    lastPlayed.purr = performance.now();
    const c = audio();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(sec);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const pulse = c.createGain();
    pulse.gain.value = 0.5;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 26;
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(pulse.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1.9, t + 0.12);
    for (let k = 0.35; k < sec - 0.15; k += 0.4) {
      env.gain.linearRampToValueAtTime(Math.round(k / 0.4) % 2 ? 1.0 : 1.9, t + k);
    }
    env.gain.linearRampToValueAtTime(0.0001, t + sec);
    src.connect(lp).connect(pulse).connect(env).connect(master);
    src.start(t); lfo.start(t);
    src.stop(t + sec); lfo.stop(t + sec);
  }

  // Шипение, когда злится.
  function hiss() {
    const c = audio();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(0.7);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(hp).connect(g).connect(master);
    src.start(t);
  }

  // Колокольчик на ошейнике: для напоминаний и встреч.
  function bell() {
    const c = audio();
    const t = c.currentTime;
    for (const [f, a] of [[1760, 0.5], [2637, 0.25], [3520, 0.12]]) {
      for (const d of [0, 0.18]) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(a, t + d + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
        o.connect(g).connect(master);
        o.start(t + d);
        o.stop(t + d + 1);
      }
    }
  }

  // Real field recordings by Kerzoven (CC0); see assets/audio/CREDITS.txt.
  const recordings = new Map();
  function recorded(name, seconds) {
    if (!state.on || recordings.has(name)) return;
    if (name === 'meow' && performance.now() - lastPlayed.meow < 1100) return;
    if (name === 'meow') lastPlayed.meow = performance.now();
    const clip = new Audio(new URL('../../assets/audio/' + (name === 'meow' ? 'meow-short.wav' : 'purr.wav'), document.baseURI).href);
    clip.preload = 'auto';
    const volume = Math.min(1, Math.max(0, state.volume)) * (name === 'meow' ? 0.65 : 0.8);
    clip.volume = 0;
    let timer = null, started = null;
    const cleanup = () => { clearInterval(timer); clip.pause(); recordings.delete(name); };
    recordings.set(name, { clip, cleanup });
    clip.addEventListener('ended', cleanup, { once: true });
    clip.addEventListener('error', cleanup, { once: true });
    clip.play().then(() => {
      if (!recordings.has(name)) return;
      started = performance.now();
      const duration = name === 'purr' ? Math.min(Math.max(Number(seconds) || 2.4, 1), 5.5) : (clip.duration || 2);
      timer = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        const fade = Math.max(0, Math.min(1, elapsed / 0.12, (duration - elapsed) / 0.25));
        clip.volume = volume * fade;
        if (elapsed >= duration || !state.on) cleanup();
      }, 30);
    }).catch(cleanup);
  }
  const play = (fn) => (...a) => { if (state.on) { try { fn(...a); } catch { /* без звука */ } } };
  window.Sound = {
    set(on, volume) { state.on = !!on; if (volume != null) state.volume = Math.min(1, Math.max(0, Number(volume) || 0)); if (!state.on) for (const item of [...recordings.values()]) item.cleanup(); },
    meow: () => recorded('meow'), purr: (sec) => recorded('purr', sec), hiss: play(hiss), bell: play(bell),
  };
})();
