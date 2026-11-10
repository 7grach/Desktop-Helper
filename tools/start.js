// На macOS запускаем через Launch Services: запуск из терминала редактора
// может наследовать его разрешения TCC вместо разрешений Electron.
const path = require('node:path');
const { spawn } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const electron = require('electron');
const extra = process.argv.slice(2);
const mac = process.platform === 'darwin';
const command = mac ? '/usr/bin/open' : electron;
const args = mac
  ? ['-n', path.resolve(electron, '../../..'), '--args', project, ...extra]
  : [project, ...extra];

const child = spawn(command, args, { stdio: 'inherit', cwd: project });
child.on('error', (err) => { console.error('Не удалось запустить Пушика:', err.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
