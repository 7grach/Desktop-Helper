const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const display = { id: 1, size: { width: 1710, height: 1107 } };
const empty = { isEmpty: () => true };
const image = { isEmpty: () => false, getSize: () => ({ width: 1024, height: 663 }) };
const source = (thumbnail = image, display_id = '1') => ({ thumbnail, display_id });

function captureHarness(sequence) {
  let calls = 0;
  const protectedStates = [];
  const c = vm.createContext({
    require(name) {
      if (name === 'electron') return {
        screen: { getPrimaryDisplay: () => display },
        desktopCapturer: { async getSources() {
          const result = sequence[Math.min(calls++, sequence.length - 1)];
          if (result instanceof Error) throw result;
          return result;
        } },
      };
      return {};
    },
    module: { exports: {} }, process: { platform: 'darwin' },
    setTimeout: (callback) => { callback(); },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/guide.js'), 'utf8'), c);
  const overlay = {
    isDestroyed: () => false, isVisible: () => true,
    setContentProtection: (value) => protectedStates.push(value),
    setAlwaysOnTop() {}, moveTop() {},
  };
  return { capture: () => c.module.exports.capture(overlay), calls: () => calls, protectedStates };
}

test('capture retries a transient empty screen and returns the next valid image', async () => {
  const h = captureHarness([[source(empty)], [source()]]);
  const shot = await h.capture();
  assert.equal(shot.image, image);
  assert.equal(h.calls(), 2);
  assert.deepEqual(h.protectedStates, [true, false]);
});

test('capture retries missing sources, with a maximum of three attempts', async () => {
  const h = captureHarness([[]]);
  await assert.rejects(h.capture(), e => e.code === 'noShot');
  assert.equal(h.calls(), 3);
  assert.deepEqual(h.protectedStates, [true, false]);
});

test('capture restores the overlay if desktop capture throws', async () => {
  const h = captureHarness([new Error('capture failed')]);
  await assert.rejects(h.capture(), /capture failed/);
  assert.deepEqual(h.protectedStates, [true, false]);
});

test('capture never substitutes another monitor for the primary monitor selection', async () => {
  const h = captureHarness([[source(image, '2'), source(empty)]]);
  await assert.rejects(h.capture(), e => e.code === 'noShot');
});

test('capture accepts a single screen without a display id', async () => {
  const h = captureHarness([[source(image, '')]]);
  assert.equal((await h.capture()).image, image);
});

function failureHarness(status, packaged = false) {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const c = vm.createContext({
    process: { platform: 'darwin' }, systemPreferences: { getMediaAccessStatus: () => status },
    app: { isPackaged: packaged, getName: () => 'Пушик' },
    t: (key, vars) => ({ key, ...vars }),
  });
  vm.runInContext(main.slice(main.indexOf('function screenAccess()'), main.indexOf("ipcMain.handle('screen:settings'")), c);
  return vm.runInContext('screenFailure()', c);
}

test('granted access with an empty capture is not reported as denied permission', () => {
  const failure = failureHarness('granted');
  assert.equal(failure.code, 'screen-capture');
  assert.equal(failure.error.key, 'err.screenCapture');
});

test('denied access identifies Electron in development and the app in a packaged build', () => {
  for (const status of ['denied', 'restricted', 'not-determined']) {
    const failure = failureHarness(status);
    assert.equal(failure.code, 'screen-permission');
    assert.equal(failure.error.app, 'Electron');
  }
  assert.equal(failureHarness('denied', true).error.app, 'Пушик');
});

test('screen recovery actions offer macOS settings only for permission errors', () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
  const invoked = [];
  const c = vm.createContext({
    settings: { platform: 'darwin' }, T: k => k,
    api: { openScreenSettings: async () => { invoked.push('settings'); return true; }, restart: () => invoked.push('restart') },
  });
  vm.runInContext(app.slice(app.indexOf('function screenErrorActions('), app.indexOf('async function look(mode)')), c);
  const permissionActions = vm.runInContext("screenErrorActions({code:'screen-permission'})", c);
  assert.equal(permissionActions.length, 2);
  permissionActions[1][1]();
  assert.deepEqual(invoked, ['restart']);
  const captureActions = vm.runInContext("screenErrorActions({code:'screen-capture'})", c);
  assert.equal(captureActions.length, 1);
  assert.equal(captureActions[0][0], 'screen.restart');
  assert.equal(vm.runInContext("screenErrorActions({code:'network'}).length", c), 0);
  assert.equal(vm.runInContext("settings.platform='win32';screenErrorActions({code:'screen-permission'}).length", c), 0);
});
