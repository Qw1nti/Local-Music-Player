import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');

const filesToCopy = [
  'index.html',
  'app.js',
  'app.css',
  'config.js',
  'config.example.js',
  'manifest.webmanifest',
  'sw.js',
  'favicon.svg',
  'favicon.png',
  'localmixer.ico',
  'tracker.html'
];

const dirsToCopy = ['icons'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of filesToCopy) {
  const src = resolve(root, file);
  if (!existsSync(src)) continue;
  cpSync(src, resolve(dist, file));
}

for (const dir of dirsToCopy) {
  const src = resolve(root, dir);
  if (!existsSync(src)) continue;
  cpSync(src, resolve(dist, dir), { recursive: true });
}

console.log('Build complete: dist/ generated');
