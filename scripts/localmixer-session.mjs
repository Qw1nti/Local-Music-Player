import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const appDir = process.cwd();
const managerPidFile = resolve(tmpdir(), 'localmixer-session.pid');
const serverPidFile = resolve(tmpdir(), 'localmixer-preview.pid');
const profileDir = resolve(tmpdir(), 'localmixer-chrome-profile');

function parsePort() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--port');
  if (i >= 0 && args[i + 1]) {
    const parsed = Number(args[i + 1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 4173;
}

const port = parsePort();
const url = `http://127.0.0.1:${port}`;

function removeFile(file) {
  try {
    unlinkSync(file);
  } catch {}
}

async function waitForServer(target, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(target);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function findChromeCommand() {
  if (process.platform === 'darwin') {
    const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return existsSync(macPath) ? macPath : null;
  }
  if (process.platform === 'win32') {
    const check = spawnSync('where', ['chrome'], { shell: true, encoding: 'utf8' });
    if (check.status === 0 && check.stdout) {
      return check.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || 'chrome';
    }
    return null;
  }

  const candidates = ['google-chrome', 'chromium-browser', 'chromium'];
  for (const cmd of candidates) {
    if (spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0) return cmd;
  }
  return null;
}

function openFallbackBrowser(targetUrl) {
  if (process.platform === 'darwin') {
    spawn('open', [targetUrl], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${targetUrl}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
    return;
  }
  spawn('xdg-open', [targetUrl], { detached: true, stdio: 'ignore' }).unref();
}

let serverChild = null;
let chromeChild = null;

function cleanupAndExit(code = 0) {
  if (chromeChild && !chromeChild.killed) {
    try {
      chromeChild.kill();
    } catch {}
  }
  if (serverChild && !serverChild.killed) {
    try {
      serverChild.kill();
    } catch {}
  }
  removeFile(serverPidFile);
  removeFile(managerPidFile);
  process.exit(code);
}

process.on('SIGINT', () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));
process.on('uncaughtException', (err) => {
  console.error(err.message);
  cleanupAndExit(1);
});

async function main() {
  mkdirSync(profileDir, { recursive: true });

  serverChild = spawn(process.execPath, [resolve(appDir, 'scripts/static-server.mjs'), '--port', String(port), '--dir', 'dist'], {
    cwd: appDir,
    stdio: 'ignore',
    detached: false,
    windowsHide: true
  });
  serverChild.on('error', (err) => {
    console.error(`Failed to start local server: ${err.message}`);
    cleanupAndExit(1);
  });
  serverChild.on('exit', () => cleanupAndExit(0));
  writeFileSync(serverPidFile, String(serverChild.pid));

  const ready = await waitForServer(url);
  if (!ready) {
    console.error(`Server did not become ready at ${url}`);
    cleanupAndExit(1);
    return;
  }

  const chromeCmd = findChromeCommand();
  if (!chromeCmd) {
    console.error('Google Chrome was not found. Opening default browser instead; auto-stop on window close is unavailable.');
    openFallbackBrowser(url);
    return;
  }

  const chromeArgs = [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    '--new-window',
    '--no-first-run',
    '--no-default-browser-check'
  ];

  chromeChild = spawn(chromeCmd, chromeArgs, {
    cwd: appDir,
    stdio: 'ignore',
    detached: false,
    shell: false,
    windowsHide: true
  });
  chromeChild.on('error', (err) => {
    console.error(`Failed to launch Chrome app window: ${err.message}`);
    cleanupAndExit(1);
  });
  chromeChild.on('exit', () => cleanupAndExit(0));
}

main();

