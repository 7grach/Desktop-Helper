const { test } = require('node:test');
const assert = require('node:assert/strict');
const { remoteApps, parseProcessList } = require('../src/remote-watch');
const I18N = require('../src/renderer/i18n');

test('remoteApps узнаёт программы удалённого доступа без учёта регистра и .exe', () => {
  assert.deepEqual(remoteApps(['AnyDesk.exe', 'TEAMVIEWER', 'rustdesk-1.2.exe']), ['AnyDesk', 'TeamViewer', 'RustDesk']);
});

test('remoteApps не дублирует программу и игнорирует обычные процессы', () => {
  assert.deepEqual(remoteApps(['AnyDesk.exe', 'anydesk', 'chrome.exe', 'explorer.exe']), ['AnyDesk']);
});

test('parseProcessList читает CSV от tasklist на Windows', () => {
  const out = '"AnyDesk.exe","1234","Console","1","10 000 КБ"\r\n"chrome.exe","5678","Console","1","50 000 КБ"\r\n';
  assert.deepEqual(parseProcessList(out, 'win32'), ['AnyDesk.exe', 'chrome.exe']);
});

test('parseProcessList читает имена процессов из ps на macOS', () => {
  const out = 'AnyDesk\nGoogle Chrome\nTeamViewer\n';
  assert.deepEqual(parseProcessList(out, 'darwin'), ['AnyDesk', 'Google Chrome', 'TeamViewer']);
});

test('тексты предупреждения есть на русском и английском', () => {
  I18N.setLang('ru');
  assert.match(I18N.t('scam.ask', { app: 'AnyDesk' }), /AnyDesk/);
  assert.match(I18N.t('scam.stop', { app: 'AnyDesk' }), /мошенники/);
  I18N.setLang('en');
  assert.match(I18N.t('scam.ask', { app: 'AnyDesk' }), /AnyDesk/);
  assert.match(I18N.t('scam.stop', { app: 'AnyDesk' }), /scammers/);
});
