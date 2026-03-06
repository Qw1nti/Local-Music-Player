import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..');
const pidFile = resolve(tmpdir(), 'localmixer-oneclick-preview.pid');
const port = 4173;
const url = `http://127.0.0.1:${port}`;

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: appDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });
    child.on('error', (err) => rejectRun(new Error(`${command} failed: ${err.message}`)));
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
    });
  });
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    stdio: 'ignore',
    shell: process.platform === 'win32'
  });
  return result.status === 0;
}

function readPackageJson() {
  const raw = readFileSync(resolve(appDir, 'package.json'), 'utf8');
  return JSON.parse(raw);
}

function hasInstallableDependencies(pkg) {
  const depCount = Object.keys(pkg.dependencies || {}).length;
  const devDepCount = Object.keys(pkg.devDependencies || {}).length;
  return depCount + devDepCount > 0;
}

function stopExistingManagedServer() {
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

async function waitForServer(target, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(target);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function openInDefaultBrowser(targetUrl) {
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

async function main() {
  if (!commandExists('npm')) {
    throw new Error('npm was not found. Please install Node.js LTS from https://nodejs.org/');
  }

  const pkg = readPackageJson();
  const shouldInstall = hasInstallableDependencies(pkg) || existsSync(resolve(appDir, 'package-lock.json'));

  if (shouldInstall) {
    console.log('Checking/installing project dependencies...');
    await run('npm', ['install', '--no-audit', '--no-fund']);
  } else {
    console.log('No npm dependencies declared. Skipping npm install.');
  }

  console.log('Building app...');
  await run('npm', ['run', 'build']);

  stopExistingManagedServer();
  console.log('Starting local server...');
  const server = spawn(process.execPath, [resolve(__dirname, 'static-server.mjs'), '--port', String(port), '--dir', 'dist'], {
    cwd: appDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  server.unref();
  writeFileSync(pidFile, String(server.pid));

  const ready = await waitForServer(url);
  if (!ready) {
    throw new Error(`Server failed to start at ${url}`);
  }

  try {
    openInDefaultBrowser(url);
  } catch (err) {
    console.warn(`Could not open browser automatically: ${err.message}`);
  }

  console.log(`App started at ${url}`);
  console.log('If needed, stop the managed server with: npm run prod:stop');
}

main().catch((err) => {
  console.error(`Launch failed: ${err.message}`);
  process.exit(1);
});

