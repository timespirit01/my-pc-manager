/**
 * 커튼 드라이버 — RS-485.
 *
 * 커튼 모터마다 프로토콜이 달라 프레임을 설정 파일에 16진수로 적어 둔다.
 * Modbus RTU 를 쓰는 제품이 많아 CRC16 자동 부착을 지원한다.
 *
 *   "open": "01 06 00 00 00 01"   + CRC16 두 바이트 → 실제 전송
 *
 * 제조사 전용 프로토콜이면 appendCrc 를 끄고 완성된 프레임을 그대로 적는다.
 */
export class CurtainDriver {
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log;
    this.port = null;
    this.state = 'unknown';
  }

  async open() {
    if (!this.cfg.enabled) {
      this.log('커튼 사용 안 함 — 명령을 기록만 합니다.');
      return;
    }
    const { SerialPort } = await import('serialport');
    this.port = new SerialPort({
      path: this.cfg.port,
      baudRate: this.cfg.baudRate || 9600,
      dataBits: this.cfg.dataBits || 8,
      stopBits: this.cfg.stopBits || 1,
      parity: this.cfg.parity || 'none',
    });
    await new Promise((res, rej) => {
      this.port.once('open', res);
      this.port.once('error', rej);
    });
    this.log(`커튼 RS-485 → ${this.cfg.port} @ ${this.cfg.baudRate || 9600}`);

    // 모터가 응답을 보내면 기록해 둔다 (연결 확인에 쓴다)
    this.port.on('data', (buf) => {
      this.lastReply = buf.toString('hex').match(/../g).join(' ').toUpperCase();
    });
  }

  /** @param {'open'|'close'|'stop'} action */
  send(action) {
    const spec = (this.cfg.frames || {})[action];
    if (!spec) throw new Error(`커튼 프레임이 설정에 없습니다: ${action}`);

    const frame = buildFrame(spec, this.cfg.appendCrc);
    this.state = action;
    if (this.port && this.port.isOpen) this.port.write(frame);
    return frame.toString('hex').match(/../g).join(' ').toUpperCase();
  }

  close() {
    if (this.port && this.port.isOpen) this.port.close();
  }
}

export function buildFrame(hexSpec, appendCrc) {
  const bytes = String(hexSpec).trim().split(/[\s,]+/).map((h) => parseInt(h, 16));
  if (bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) {
    throw new Error(`프레임을 읽지 못했습니다: ${hexSpec}`);
  }
  const body = Buffer.from(bytes);
  if (!appendCrc) return body;
  const crc = crc16Modbus(body);
  return Buffer.concat([body, Buffer.from([crc & 0xff, (crc >> 8) & 0xff])]);
}

/** Modbus RTU CRC16 (하위 바이트 먼저 전송) */
export function crc16Modbus(buf) {
  let crc = 0xffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}
