// Local file lessons: only known folders and an explicit native file picker.
const { app, shell, dialog, systemPreferences } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function practicePath() { return path.join(app.getPath('userData'), 'Пушик — учимся работать с файлами'); }
async function preparePractice() {
  const folder = practicePath();
  await fs.mkdir(path.join(folder, 'Мои открытки'), { recursive: true });
  // Never overwrite a file the learner may have edited.
  for (const [name, text] of [
    ['Привет от Пушика.txt', 'Привет! Это учебный файл Пушика.\nТы научился открывать документы. Мур!\n'],
    ['Мои открытки/Открытка.txt', 'Хорошего дня!\nТвои настоящие файлы лежат в других папках.\n'],
  ]) {
    try { await fs.writeFile(path.join(folder, name), text, { flag: 'wx' }); }
    catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
  return folder;
}
async function action(req = {}, owner) {
  try {
    if (req.op === 'access') return { trusted: process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false) };
    if (req.op === 'permissions' && process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      return { ok: true };
    }
    if (req.op === 'open') {
      const dirs = { downloads: () => app.getPath('downloads'), documents: () => app.getPath('documents'), practice: preparePractice };
      if (!Object.hasOwn(dirs, req.place)) return { error: 'unknown folder' };
      const error = await shell.openPath(await dirs[req.place]());
      return error ? { error } : { ok: true };
    }
    if (req.op === 'choose') {
      const result = await dialog.showOpenDialog(owner, { title: 'Выбери файл, который хочешь открыть', properties: ['openFile'] });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const error = await shell.openPath(result.filePaths[0]);
      return error ? { error } : { ok: true };
    }
    return { error: 'unsupported' };
  } catch (err) { return { error: err.message }; }
}
module.exports = { action };
