// Bundle a small native AX reader; Windows builds do not need a Swift compiler.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
if (process.platform === 'darwin') {
  const root = path.join(__dirname, '..');
  const source = path.join(root, 'src/native/locator.swift');
  const target = path.join(root, 'assets/mac', `locator-${process.arch}`);
  if (!fs.existsSync(target) || fs.statSync(source).mtimeMs > fs.statSync(target).mtimeMs) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    execFileSync('/usr/bin/xcrun', ['swiftc', source, '-O', '-module-cache-path', path.join(require('os').tmpdir(), 'pushik-swift-cache'), '-o', target], { stdio: 'inherit' });
  }
}
