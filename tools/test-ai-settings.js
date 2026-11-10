// Run with: node --test tools/test-ai-settings.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const hostPath = require('node:path');

// The app is tested as if it runs on a POSIX system: main.js uses path.join
// with absolute /app and /data paths. The host may be Windows, so keep its
// native path module for reading files and give the sandbox path.posix.
const sandboxPath = hostPath.posix;

// Run the real settings functions without launching the desktop overlay or contacting a service.
function harness(teamConfig = {}, encryption = true) {
  let disk;
  const source = fs.readFileSync(hostPath.join(__dirname, '../src/main.js'), 'utf8');
  const context = vm.createContext({
    path: sandboxPath, Buffer, __dirname: '/app/src', process: { platform: 'darwin', resourcesPath: '/resources' },
    fs: {
      readFileSync(file) {
        if (file === '/app/team.json') return JSON.stringify(teamConfig);
        if (file === '/data/settings.json' && disk) return disk;
        throw new Error('not found');
      },
      existsSync: () => false, mkdirSync() {},
      writeFileSync(_file, data) { disk = data; },
    },
    safeStorage: {
      isEncryptionAvailable: () => encryption,
      encryptString: (s) => Buffer.from('encrypted:' + s),
      decryptString: (b) => b.toString().slice('encrypted:'.length),
    },
    app: { getPath: () => '/data', getLocale: () => 'ru', setLoginItemSettings() {} },
    stt: { DEFAULT_URL: 'https://api.groq.com/openai/v1', DEFAULT_MODEL: 'whisper-large-v3' },
    VOSK_MODEL: '/vosk', locate: { supported: () => true }, I18N: { setLang() {} },
    t: (s) => s, createTrayMenu() {}, startCalendar() {}, startWindowsWatch() {}, tray: null,
  });
  vm.runInContext(source.slice(source.indexOf('const DEFAULTS ='), source.indexOf('// ---------- Напоминания')), context);
  const run = (code) => vm.runInContext(code, context);
  run('settings = loadSettings()');
  return { run, disk: () => JSON.parse(disk) };
}

test('personal Groq key is encrypted, hidden from renderer and survives restart over team config', () => {
  const h = harness({ provider: 'claude', apiKey: 'team-placeholder', model: 'claude-test' });
  h.run("saveSettings({ provider: 'groq', apiKey: '  personal-placeholder  ' })");
  assert.equal(h.disk().apiKey, undefined);
  assert.ok(h.disk().apiKeyEnc);
  assert.equal(h.run('publicSettings().apiKey'), undefined);
  assert.equal(h.run('publicSettings().apiKeyEnc'), undefined);
  h.run('settings = loadSettings()');
  assert.equal(h.run('settings.apiKey'), 'personal-placeholder');
  assert.equal(h.run('settings.provider'), 'groq');
  assert.equal(h.run('settings.model'), '');
  assert.equal(h.run('publicSettings().aiReady'), true);
});

test('empty key preserves existing key while ordinary settings still save', () => {
  const h = harness();
  h.run("saveSettings({ provider: 'groq', apiKey: 'placeholder' })");
  h.run("saveSettings({ apiKey: '  ', userName: 'Test' })");
  h.run('settings = loadSettings()');
  assert.equal(h.run('settings.apiKey'), 'placeholder');
  assert.equal(h.run('settings.userName'), 'Test');
});

test('ordinary settings can be saved without connecting AI', () => {
  const h = harness();
  h.run("saveSettings({ sound: false })");
  assert.equal(h.run('publicSettings().aiReady'), false);
  assert.equal(h.disk().sound, false);
});

test('changing cloud service requires its own key and clears old endpoint and model', () => {
  const h = harness({ provider: 'groq', apiKey: 'team-placeholder', aiUrl: 'https://old.invalid', model: 'old', visionModel: 'old-vision' });
  assert.throws(() => h.run("saveSettings({ provider: 'claude' })"), /set.keyRequired/);
  assert.equal(h.run('settings.provider'), 'groq');
  h.run("saveSettings({ provider: 'claude', apiKey: 'new-placeholder' })");
  h.run('settings = loadSettings()');
  assert.equal(h.run('settings.aiUrl'), '');
  assert.equal(h.run('settings.visionModel'), '');
  assert.equal(h.run('settings.model'), h.run('DEFAULTS.model'));
});

test('same-provider personal key also overrides team key after restart', () => {
  const h = harness({ provider: 'groq', groqKey: 'legacy-placeholder' });
  h.run("saveSettings({ provider: 'groq', apiKey: 'personal-placeholder' })");
  h.run('settings = loadSettings()');
  assert.equal(h.run('settings.apiKey'), 'personal-placeholder');
  assert.equal(h.run('publicSettings().teamKey'), false);
});

test('team-only configuration continues to load unchanged', () => {
  const h = harness({ provider: 'groq', apiKey: 'team-placeholder' });
  h.run("saveSettings({ userName: 'Test' })");
  assert.equal(h.disk().apiKey, undefined);
  h.run('settings = loadSettings()');
  assert.equal(h.run('settings.apiKey'), 'team-placeholder');
  assert.equal(h.run('publicSettings().teamKey'), true);
});
