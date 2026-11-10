const { contextBridge, ipcRenderer } = require('electron');

// Мост между окном кота и главным процессом.
contextBridge.exposeInMainWorld('pushik', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('ignore-mouse', ignore),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  ollamaModels: (url) => ipcRenderer.invoke('ollama:models', url),
  chat: (text) => ipcRenderer.invoke('chat:send', text),
  resetChat: () => ipcRenderer.invoke('chat:reset'),
  addReminder: (minutes, text, kind) => ipcRenderer.invoke('reminders:add', { minutes, text, kind }),
  listReminders: () => ipcRenderer.invoke('reminders:list'),
  cancelReminder: (id) => ipcRenderer.invoke('reminders:cancel', id),
  listCalendar: (days) => ipcRenderer.invoke('calendar:list', days),
  quit: () => ipcRenderer.send('app:quit'),
  hide: () => ipcRenderer.send('app:hide'),
  simplifyExplanation: (text) => ipcRenderer.invoke('guide:simplify', text),
  guideLook: (req) => ipcRenderer.invoke('guide:look', req),
  guideWatch: (masks) => ipcRenderer.send('guide:watch', masks),
  guideUnwatch: () => ipcRenderer.send('guide:unwatch'),
  transcribe: (audio, mime) => ipcRenderer.invoke('stt:transcribe', { audio, mime }),
  askMic: () => ipcRenderer.invoke('mic:ask'),
  savePostcard: (data) => ipcRenderer.invoke('postcard:save', data),
  addSkill: (name) => ipcRenderer.invoke('skills:add', name),
  locate: (q) => ipcRenderer.invoke('locate', q),
  openUri: (uri) => ipcRenderer.invoke('open:uri', uri),
  filesAction: (req) => ipcRenderer.invoke('files:action', req),
  openDrive: (letter) => ipcRenderer.invoke('open:drive', letter),
  on: (channel, cb) => {
    const allowed = ['reminder', 'reminders-changed', 'open', 'settings-changed', 'toggle-visible',
      'calendar-soon', 'calendar-changed', 'windows', 'screen-changed', 'ai-wait', 'skill-earned'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, data) => cb(data));
  },
});
