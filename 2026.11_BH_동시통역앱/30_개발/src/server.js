// 개발용 서버: public/ 정적 파일 + POST /api/token.
// 실행: GEMINI_API_KEY=... node server.js   (기본 주소 http://localhost:5173)
// 배포(Vercel)에서는 이 파일을 쓰지 않고 public/ 과 api/token.js 가 그대로 올라간다.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { issueToken } from './lib/issue-token.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function startServer({ port = 5173, env = process.env } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/token') {
      res.setHeader('cache-control', 'no-store');
      res.setHeader('content-type', 'application/json');
      if (req.method !== 'POST') {
        res.writeHead(405).end('{"code":"method"}');
        return;
      }
      const out = await issueToken(await readBody(req), env);
      res.writeHead(out.status).end(JSON.stringify(out.body));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 5173;
  startServer({ port }).then(() => {
    console.log(`마주 통역 개발 서버: http://localhost:${port}`);
    if (!process.env.GEMINI_API_KEY) console.log('주의: GEMINI_API_KEY가 없어 통역 엔진에 연결할 수 없습니다.');
  });
}
