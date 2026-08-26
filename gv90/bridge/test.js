#!/usr/bin/env node
/**
 * 하드웨어 점검 CLI.
 *
 * 콘텐츠를 띄우지 않고 장비 배선만 따로 확인할 때 쓴다.
 * 설치 현장에서 조명 채널 패치와 커튼 프레임을 맞출 때 가장 먼저 돌린다.
 *
 *   node test.js --ports                 연결된 시리얼 포트 목록
 *   node test.js --dmx "#FCC77B" 0.9     조명을 그 색으로 (밝기 0~1)
 *   node test.js --dmx off               조명 끄기
 *   node test.js --curtain open          커튼 개방
 *   node test.js --curtain close         커튼 닫힘
 *   node test.js --frames                설정된 커튼 프레임을 CRC 까지 계산해 보여준다
 *   node test.js --sweep                 조명 채널을 1개씩 훑어 패치 확인
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DmxDriver } from './drivers/dmx.js';
import { CurtainDriver, buildFrame } from './drivers/curtain.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function strip(node) {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, strip(v)]));
  }
  return node;
}

function loadConfig() {
  const own = path.join(HERE, 'config.json');
  if (!fs.existsSync(own)) {
    console.error('config.json 이 없습니다. config.example.json 을 복사해 채우세요.');
    process.exit(1);
  }
  return strip(JSON.parse(fs.readFileSync(own, 'utf8')));
}

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueAfter = (flag, n = 1) => {
  const i = argv.indexOf(flag);
  return i < 0 ? [] : argv.slice(i + 1, i + 1 + n);
};

/* --- 포트 목록 ------------------------------------------------------------ */
if (has('--ports') || argv.length === 0) {
  try {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    if (!ports.length) log('연결된 시리얼 포트가 없습니다.');
    for (const p of ports) {
      log(`  ${p.path.padEnd(14)} ${(p.manufacturer || '제조사 미상').padEnd(24)} ${p.serialNumber || ''}`);
    }
  } catch (err) {
    log(`serialport 를 불러오지 못했습니다: ${err.message}`);
    log('  cd bridge && npm install');
  }
  if (argv.length === 0) {
    log('\n사용법은 이 파일 맨 위 주석을 참고하세요.  node test.js --help');
  }
  process.exit(0);
}

if (has('--help')) {
  log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('*/')[0].split('/**')[1].trim().replace(/^ ?\* ?/gm, ''));
  process.exit(0);
}

const config = loadConfig();

/* --- 커튼 프레임 미리보기 -------------------------------------------------- */
if (has('--frames')) {
  const c = config.curtain || {};
  log(`커튼 프레임 (appendCrc: ${c.appendCrc ? '켜짐 — Modbus CRC16 자동 부착' : '꺼짐'})`);
  for (const [name, spec] of Object.entries(c.frames || {})) {
    const hex = buildFrame(spec, c.appendCrc).toString('hex').match(/../g).join(' ').toUpperCase();
    log(`  ${name.padEnd(6)} ${spec}   →   ${hex}`);
  }
  process.exit(0);
}

/* --- 조명 ----------------------------------------------------------------- */
if (has('--dmx')) {
  const [colorArg, dimArg] = valueAfter('--dmx', 2);
  const dmx = new DmxDriver(config.dmx, log);
  await dmx.open();
  const off = colorArg === 'off';
  dmx.set({
    color: off ? '#000000' : (colorArg || '#FFFFFF'),
    dimmer: off ? 0 : Number(dimArg ?? 1),
    fadeMs: 800,
  });
  log(`조명 → ${off ? '끄기' : colorArg} (Ctrl+C 로 종료, 종료하면 출력이 멈춥니다)`);
  await sleep(1e9);
}

/* --- 조명 채널 훑기 — 패치 확인용 ------------------------------------------ */
if (has('--sweep')) {
  const dmx = new DmxDriver(config.dmx, log);
  await dmx.open();
  for (const fx of config.dmx.fixtures || []) {
    for (let i = 0; i < fx.channels.length; i++) {
      const name = fx.channels[i];
      log(`  ${fx.id}  ch${fx.start + i}  ${name}  → 255`);
      dmx.frame.fill(0, 1);
      dmx.frame[fx.start + i] = 255;
      // dimmer 가 따로 있으면 함께 올려야 눈에 보인다
      const d = fx.channels.indexOf('dimmer');
      if (d >= 0 && d !== i) dmx.frame[fx.start + d] = 255;
      await sleep(1500);
    }
  }
  log('훑기 끝. 켜진 순서와 실제 색이 맞는지 확인하세요.');
  dmx.close();
  process.exit(0);
}

/* --- 커튼 ----------------------------------------------------------------- */
if (has('--curtain')) {
  const [action] = valueAfter('--curtain');
  const curtain = new CurtainDriver(config.curtain, log);
  await curtain.open();
  const frame = curtain.send(action);
  log(`커튼 → ${action}  [${frame}]`);
  await sleep(2500);
  if (curtain.lastReply) log(`  모터 응답: ${curtain.lastReply}`);
  else log('  모터 응답 없음 (응답을 보내지 않는 제품일 수 있습니다)');
  curtain.close();
  process.exit(0);
}

log('무엇을 할지 지정해 주세요.  node test.js --help');
