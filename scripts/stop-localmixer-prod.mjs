import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const pidFile = resolve(tmpdir(), 'localmixer-preview.pid');

function main() {
  if (!existsSync(pidFile)) {
    console.log('No managed Local Mixer preview server is running.');
    return;
  }

  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid);
      console.log('Stopped Local Mixer managed preview server.');
    } catch {
      console.log('Preview process was not running.');
    }
  }

  try {
    unlinkSync(pidFile);
  } catch {}
}

main();

