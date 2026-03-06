import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..');
const port = 4173;
const url = `http://127.0.0.1:${port}`;
const pidFile = resolve(tmpdir(), 'localmixer-preview.pid');

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: appDir, shell: false, ...options });
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(target, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(target);
      if (res.ok) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

function stopExisting() {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch {}
  }
  try {
    unlinkSync(pidFile);
  } catch {}
}

function openApp(targetUrl) {
  const launchDetached = (command, args) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  };

  if (process.platform === 'darwin') {
    launchDetached('open', ['-na', 'Google Chrome', '--args', `--app=${targetUrl}`]);
    return;
  }

  if (process.platform === 'win32') {
    const hasChrome = spawnSync('cmd', ['/c', 'where chrome'], { stdio: 'ignore' }).status === 0;
    if (hasChrome) {
      launchDetached('cmd', ['/c', 'start', '', 'chrome', `--app=${targetUrl}`]);
    } else {
      launchDetached('cmd', ['/c', 'start', '', targetUrl]);
    }
    return;
  }

  const hasChrome = spawnSync('which', ['google-chrome'], { stdio: 'ignore' }).status === 0;
  if (hasChrome) {
    launchDetached('google-chrome', [`--app=${targetUrl}`]);
    return;
  }
  launchDetached('xdg-open', [targetUrl]);
}

async function main() {
  stopExisting();
  await run(npmCommand(), ['run', 'build']);

  const server = spawn(process.execPath, [resolve(__dirname, 'static-server.mjs'), '--port', String(port), '--dir', 'dist'], {
    cwd: appDir,
    detached: true,
    stdio: 'ignore'
  });
  server.unref();
  writeFileSync(pidFile, String(server.pid));

  const ready = await waitForServer(url);
  if (!ready) {
    throw new Error(`Preview server failed to start at ${url}`);
  }

  openApp(url);
  console.log(`Local Mixer launched at ${url}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
