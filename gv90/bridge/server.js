#!/usr/bin/env node
/**
 * GV90 공간 제어 브릿지.
 *
 * 브라우저는 시리얼 포트를 열 수 없다. 전시장 PC 에서 이 서비스를 띄우면
 * 콘텐츠가 WebSocket 으로 보낸 명령을 실제 장비로 옮겨 준다.
 *
 *   브라우저 ──ws──▶ 브릿지 ──┬─ DMX   조명
 *                              └─ RS-485 커튼
 *
 * 실행:
 *   cd bridge && npm install && node server.js
 *
 * 장비가 없거나 설정에서 enabled 를 꺼 두면 명령을 화면에 기록만 한다.
 * 하드웨어 반입 전에 콘텐츠만 먼저 점검할 때 쓴다.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { DmxDriver } from './drivers/dmx.js';
import { CurtainDriver } from './drivers/curtain.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function stamp() {
  return new Date().toTimeString().slice(0, 8);
}
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

function loadConfig() {
  const own = path.join(HERE, 'config.json');
  const example = path.join(HERE, 'config.example.json');
  if (!fs.existsSync(own)) {
    console.error('config.json 이 없습니다. config.example.json 을 복사해 현장 값으로 채우세요.\n');
    console.error(`  cp ${path.relative(process.cwd(), example)} ${path.relative(process.cwd(), own)}\n`);
    process.exit(1);
  }
  // $ 로 시작하는 키는 설명용 주석이라 걷어낸다
  return strip(JSON.parse(fs.readFileSync(own, 'utf8')));
}

function strip(node) {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, strip(v)]));
  }
  return node;
}

const config = loadConfig();
const dmx = new DmxDriver(config.dmx || { enabled: false }, log);
const curtain = new CurtainDriver(config.curtain || { enabled: false }, log);

for (const [name, driver] of [['DMX', dmx], ['커튼', curtain]]) {
  try {
    await driver.open();
  } catch (err) {
    // 한 장비가 안 붙어도 나머지는 계속 돌아야 한다
    log(`⚠ ${name} 연결 실패: ${err.message}`);
    log(`  포트를 확인하세요:  node test.js --ports`);
  }
}

/* --------------------------------------------------------------------------
   명령 처리
   -------------------------------------------------------------------------- */

function handle(cmd) {
  switch (cmd.type) {
    case 'dmx': {
      dmx.set(cmd);
      return `조명  ${cmd.color} · ${Math.round((cmd.dimmer ?? 1) * 100)}% · ${cmd.fadeMs ?? 0}ms`;
    }
    case 'curtain': {
      const frame = curtain.send(cmd.action);
      return `커튼  ${cmd.action}${frame ? `  [${frame}]` : ''}`;
    }
    case 'audio':
      // 음원은 브라우저가 PC 출력으로 직접 재생한다. 여기서는 기록만 남긴다.
      return `사운드 ${cmd.action}${cmd.label ? ` (${cmd.label})` : ''}`;
    case 'ping':
      return 'ping';
    default:
      throw new Error(`모르는 명령입니다: ${cmd.type}`);
  }
}

/* --------------------------------------------------------------------------
   서버
   -------------------------------------------------------------------------- */

const { host = '127.0.0.1', port = 8090 } = config.server || {};
const server = http.createServer((req, res) => {
  // 상태 확인용 — 브라우저나 모니터링에서 찔러 볼 수 있게 둔다
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true,
    dmx: { enabled: !!config.dmx?.enabled, port: config.dmx?.port ?? null },
    curtain: { enabled: !!config.curtain?.enabled, port: config.curtain?.port ?? null, state: curtain.state },
    clients: wss.clients.size,
  }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  log(`콘텐츠 연결됨 (${req.socket.remoteAddress})`);
  ws.on('message', (raw) => {
    let cmd;
    try {
      cmd = JSON.parse(raw.toString());
    } catch (_) {
      ws.send(JSON.stringify({ type: 'error', message: '명령을 읽지 못했습니다' }));
      return;
    }
    try {
      log(handle(cmd));
      ws.send(JSON.stringify({ type: 'ok', of: cmd.type }));
    } catch (err) {
      log(`⚠ ${err.message}`);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });
  ws.on('close', () => log('콘텐츠 연결 끊김'));
});

server.listen(port, host, () => {
  log(`GV90 공간 제어 브릿지 실행 중 — ws://${host}:${port}`);
  log(`  조명 DMX  ${config.dmx?.enabled ? config.dmx.driver + ' @ ' + (config.dmx.port || config.dmx.artnet?.host) : '사용 안 함'}`);
  log(`  커튼 485  ${config.curtain?.enabled ? config.curtain.port : '사용 안 함'}`);
  log('  종료: Ctrl+C');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('정리하고 종료합니다.');
    dmx.close();
    curtain.close();
    server.close(() => process.exit(0));
  });
}
