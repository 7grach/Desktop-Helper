// Голос → текст через любой Whisper-совместимый сервис (/audio/transcriptions).
// По умолчанию Groq: Whisper large-v3 бесплатно, нужен только бесплатный ключ с console.groq.com.
// Подойдут и OpenAI (https://api.openai.com/v1, whisper-1), и свой сервер (faster-whisper-server и т.п.).

const { fetchAI } = require('./http');

const DEFAULT_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'whisper-large-v3';

async function transcribe({ sttUrl, sttKey, sttModel, lang }, audio, mime = 'audio/webm') {
  const base = (sttUrl || DEFAULT_URL).replace(/\/+$/, '');
  const form = new FormData();
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
  form.append('file', new Blob([audio], { type: mime }), `voice.${ext}`);
  form.append('model', sttModel || DEFAULT_MODEL);
  form.append('language', lang === 'en' ? 'en' : 'ru');
  form.append('response_format', 'json');
  const headers = sttKey ? { authorization: `Bearer ${sttKey}` } : {};
  const res = await fetchAI(`${base}/audio/transcriptions`, {
    method: 'POST', headers, body: form, signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error?.message || j.error || msg; } catch { /* пусто */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return String(data.text || '').trim();
}

module.exports = { transcribe, DEFAULT_URL, DEFAULT_MODEL };
