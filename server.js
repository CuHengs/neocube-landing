// 로컬 개발 서버. 정적 파일 서빙 + POST /api/lead.
// 프로덕션(Vercel)에서는 정적 파일은 CDN이, /api/lead는 api/lead.js가 처리한다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// .env를 있으면 읽는다 (Node 20.12+ 내장). 실제 환경 변수가 이미 있으면 그쪽이 우선.
try {
  process.loadEnvFile();
} catch {
  // .env 없음 — 환경 변수로만 동작
}

const { handleLead, clientIp, missingEnv } = await import('./lib/lead.js');
const { handleChat } = await import('./lib/chat.js');

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 100_000; // 100KB — 상담 폼에 이보다 큰 본문은 올 일이 없다

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);

  // 경로 탈출(../) 차단: 정규화 후에도 ROOT 아래여야 한다.
  const target = normalize(join(ROOT, rel));
  const rootPrefix = ROOT.endsWith(sep) ? ROOT : ROOT + sep;
  if (!target.startsWith(rootPrefix)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // /api/lead 와 /api/chat 은 Vercel에서 api/*.js 서버리스 함수가 처리하는 것과 같은 로직을 쓴다.
  const apiHandlers = { '/api/lead': handleLead, '/api/chat': handleChat };
  const apiHandler = apiHandlers[pathname];
  if (apiHandler) {
    if (req.method !== 'POST') {
      return json(res, 405, { ok: false, error: 'POST만 허용됩니다.' }, { Allow: 'POST' });
    }
    let body;
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { ok: false, error: '요청 본문을 읽을 수 없습니다.' });
    }
    // 로컬은 프록시 뒤가 아니므로 x-forwarded-for를 믿지 않는다 (클라이언트가 위조할 수 있음).
    const ip = clientIp(req.headers, req.socket.remoteAddress, false);
    const { status, body: payload } = await apiHandler(body, ip);
    const headers = status === 429 && payload.retryAfter ? { 'Retry-After': String(payload.retryAfter) } : {};
    return json(res, status, payload, headers);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { ok: false, error: 'Method Not Allowed' });
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`로컬 서버: http://localhost:${PORT}`);
  const missing = missingEnv();
  if (missing.length) {
    console.warn(`경고: 환경 변수 미설정 — ${missing.join(', ')}`);
    console.warn('       검증·honeypot·rate limit은 동작하지만 Airtable 기록은 502로 실패합니다. .env를 확인하세요.');
  }
});
