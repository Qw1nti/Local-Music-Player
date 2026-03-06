import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const managerPidFile = resolve(tmpdir(), 'localmixer-session.pid');
const serverPidFile = resolve(tmpdir(), 'localmixer-preview.pid');

function stopFromPidFile(file) {
  if (!existsSync(file)) return false;
  const pid = Number(readFileSync(file, 'utf8').trim());
  let stopped = false;
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid);
      stopped = true;
    } catch {
      stopped = false;
    }
  }
  try {
    unlinkSync(file);
  } catch {}
  return stopped;
}

function main() {
  const managerStopped = stopFromPidFile(managerPidFile);
  const serverStopped = stopFromPidFile(serverPidFile);
  if (!managerStopped && !serverStopped) {
    console.log('No managed Local Mixer app session is running.');
    return;
  }
  console.log('Stopped Local Mixer managed app session.');
}

main();
