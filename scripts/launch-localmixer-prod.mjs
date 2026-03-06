import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..');
const port = 4173;
const url = `http://127.0.0.1:${port}`;
const managerPidFile = resolve(tmpdir(), 'localmixer-session.pid');
const pidFile = resolve(tmpdir(), 'localmixer-preview.pid');

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: appDir,
      shell: process.platform === 'win32',
      ...options
    });
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function killPidFromFile(file) {
  if (!existsSync(file)) return;
  const pid = Number(readFileSync(file, 'utf8').trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch {}
  }
  try {
    unlinkSync(file);
  } catch {}
}

function stopExisting() {
  killPidFromFile(managerPidFile);
  killPidFromFile(pidFile);
}

async function main() {
  stopExisting();
  await run('npm', ['run', 'build']);

  const manager = spawn(process.execPath, [resolve(__dirname, 'localmixer-session.mjs'), '--port', String(port)], {
    cwd: appDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    shell: false
  });
  manager.on('error', (err) => {
    console.error(`Failed to start app session manager: ${err.message}`);
  });
  manager.unref();
  writeFileSync(managerPidFile, String(manager.pid));

  // Wait briefly for manager to boot and serve.
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) {
    throw new Error(`App session did not become ready at ${url}. Run npm run prod:stop and try again.`);
  }
  console.log(`Local Mixer launched at ${url} (managed session).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
