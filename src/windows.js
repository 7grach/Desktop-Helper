// Следим за окнами других программ, чтобы Пуш мог гулять по их верхним краям.
// Windows: PowerShell с маленьким куском C# (EnumWindows), macOS: JXA (CGWindowListCopyWindowInfo).
// Никаких нативных модулей: если что-то не работает, кот просто гуляет по низу экрана.
// Результат: список окон спереди назад [[id, x, y, w, h], ...] в экранных координатах.

const { spawn } = require('child_process');

const WIN_SCRIPT = (skipPid) => `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class PushWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public static void Init() { try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { } SetProcessDPIAware(); }
  public static string List(uint skipPid) {
    var sb = new StringBuilder("[");
    EnumWindows(delegate (IntPtr h, IntPtr p) {
      if (!IsWindowVisible(h) || IsIconic(h) || GetWindowTextLength(h) == 0) return true;
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == skipPid) return true;
      RECT r;
      if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r);
      if (r.R - r.L < 80 || r.B - r.T < 50) return true;
      if (sb.Length > 1) sb.Append(',');
      sb.Append('[').Append(h.ToInt64()).Append(',').Append(r.L).Append(',').Append(r.T)
        .Append(',').Append(r.R - r.L).Append(',').Append(r.B - r.T).Append(']');
      return true;
    }, IntPtr.Zero);
    return sb.Append(']').ToString();
  }
}
"@
[PushWin]::Init()
while ($true) {
  [Console]::Out.WriteLine([PushWin]::List(${skipPid}))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 600
}
`;

const MAC_SCRIPT = (skipPid) => `
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
const out = $.NSFileHandle.fileHandleWithStandardOutput;
while (true) {
  const ref = $.CGWindowListCopyWindowInfo(17, 0); // на экране, без рабочего стола
  const list = ObjC.deepUnwrap(ObjC.castRefToObject(ref)) || [];
  const res = [];
  for (const w of list) {
    if (w.kCGWindowLayer !== 0 || w.kCGWindowOwnerPID === ${skipPid} || w.kCGWindowAlpha === 0) continue;
    const b = w.kCGWindowBounds;
    if (!b || b.Width < 80 || b.Height < 50) continue;
    res.push([w.kCGWindowNumber, b.X, b.Y, b.Width, b.Height]);
  }
  out.writeData($(JSON.stringify(res) + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));
  delay(0.6);
}
`;

let proc = null;

/** start(onList, toDip) — запускает слежку. toDip переводит физические пиксели Windows в логические. */
function start(onList, toDip = (r) => r) {
  stop();
  let cmd;
  let args;
  if (process.platform === 'win32') {
    const encoded = Buffer.from(WIN_SCRIPT(process.pid), 'utf16le').toString('base64');
    cmd = 'powershell.exe';
    args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded];
  } else if (process.platform === 'darwin') {
    cmd = '/usr/bin/osascript';
    args = ['-l', 'JavaScript', '-e', MAC_SCRIPT(process.pid)];
  } else {
    return; // на Linux пока только пол
  }
  try {
    proc = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    proc = null;
    return;
  }
  let buf = '';
  let lastSent = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    const line = lines.pop();
    if (!line || line === lastSent) return;
    lastSent = line;
    try {
      const list = JSON.parse(line).map(([id, x, y, w, h]) => {
        const r = toDip({ x, y, width: w, height: h });
        return [id, r.x, r.y, r.width, r.height];
      });
      onList(list);
    } catch { /* битая строка, ждём следующую */ }
  });
  proc.on('error', () => { proc = null; });
  proc.on('exit', () => { proc = null; });
}

function stop() {
  if (proc) { proc.kill(); proc = null; }
}

module.exports = { start, stop };
