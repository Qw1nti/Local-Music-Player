import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

function parseArgs(argv) {
  const args = { port: 4173, dir: 'dist' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) {
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--dir' && argv[i + 1]) {
      args.dir = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac'
};

const { port, dir } = parseArgs(process.argv.slice(2));
const root = resolve(process.cwd(), dir);

function safeResolve(urlPath) {
  const cleaned = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const normalized = normalize(cleaned);
  const candidate = resolve(root, normalized);
  if (!candidate.startsWith(root)) return null;
  return candidate;
}

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  let requested = safeResolve(req.url);
  if (!requested) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (req.url === '/' || req.url.endsWith('/')) {
    requested = join(root, 'index.html');
  }

  if (existsSync(requested) && statSync(requested).isFile()) {
    sendFile(res, requested);
    return;
  }

  // SPA fallback for client-side routes.
  const fallback = join(root, 'index.html');
  if (existsSync(fallback)) {
    sendFile(res, fallback);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Static server running at http://127.0.0.1:${port} (dir: ${root})`);
});

