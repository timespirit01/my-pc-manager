/**
 * DMX512 조명 드라이버.
 *
 * 두 가지 경로를 지원한다.
 *   enttec-usb-pro  USB-시리얼 인터페이스 (전시장에서 가장 흔하다)
 *   artnet          이더넷 Art-Net 노드 (UDP)
 *
 * DMX 는 상태를 유지하지 않는 프로토콜이라 같은 값을 계속 다시 보내야 한다.
 * refreshMs 마다 현재 프레임을 재전송한다.
 */
import dgram from 'node:dgram';

const ENTTEC_START = 0x7e;
const ENTTEC_END = 0xe7;
const ENTTEC_SEND_DMX = 6;

export class DmxDriver {
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log;
    this.frame = Buffer.alloc(513, 0);   // [0] 은 스타트 코드
    this.fade = null;
    this.port = null;
    this.socket = null;
    this.timer = 0;
  }

  async open() {
    if (!this.cfg.enabled) {
      this.log('DMX 사용 안 함 — 명령을 기록만 합니다.');
      return;
    }
    if (this.cfg.driver === 'artnet') {
      this.socket = dgram.createSocket('udp4');
      this.log(`DMX Art-Net → ${this.cfg.artnet.host} universe ${this.cfg.artnet.universe}`);
    } else {
      const { SerialPort } = await import('serialport');
      this.port = new SerialPort({ path: this.cfg.port, baudRate: this.cfg.baudRate || 250000 });
      await new Promise((res, rej) => {
        this.port.once('open', res);
        this.port.once('error', rej);
      });
      this.log(`DMX Enttec → ${this.cfg.port}`);
    }
    this.timer = setInterval(() => this._flush(), this.cfg.refreshMs || 40);
  }

  /** 색과 밝기를 fadeMs 에 걸쳐 건너간다 */
  set({ color, dimmer = 1, fadeMs = 0 }) {
    const target = Buffer.from(this.frame);
    const [r, g, b] = hexToRgb(color) || [0, 0, 0];
    const w = Math.min(r, g, b);                       // 흰색 채널이 있으면 공통분을 옮긴다
    const lv = (v) => Math.round(clamp(v, 0, 255));

    for (const fx of this.cfg.fixtures || []) {
      const values = {
        r: lv(r), g: lv(g), b: lv(b), w: lv(w),
        dimmer: lv(dimmer * 255),
      };
      fx.channels.forEach((name, i) => {
        const ch = fx.start + i;
        if (ch >= 1 && ch <= 512 && values[name] !== undefined) target[ch] = values[name];
      });
      // dimmer 채널이 없는 조명은 색에 밝기를 곱해 넣는다
      if (!fx.channels.includes('dimmer')) {
        fx.channels.forEach((name, i) => {
          const ch = fx.start + i;
          if ('rgbw'.includes(name)) target[ch] = lv(target[ch] * dimmer);
        });
      }
    }

    if (fadeMs > 0) {
      this.fade = { from: Buffer.from(this.frame), to: target, t0: Date.now(), ms: fadeMs };
    } else {
      this.frame = target;
      this.fade = null;
    }
  }

  _flush() {
    if (this.fade) {
      const k = Math.min((Date.now() - this.fade.t0) / this.fade.ms, 1);
      for (let i = 1; i <= 512; i++) {
        this.frame[i] = Math.round(this.fade.from[i] + (this.fade.to[i] - this.fade.from[i]) * k);
      }
      if (k >= 1) this.fade = null;
    }

    if (this.socket) this._sendArtnet();
    else if (this.port && this.port.isOpen) this._sendEnttec();
  }

  _sendEnttec() {
    const data = this.frame.subarray(0, 513);
    const head = Buffer.from([
      ENTTEC_START, ENTTEC_SEND_DMX, data.length & 0xff, (data.length >> 8) & 0xff,
    ]);
    this.port.write(Buffer.concat([head, data, Buffer.from([ENTTEC_END])]));
  }

  _sendArtnet() {
    const { host, universe = 0 } = this.cfg.artnet;
    const header = Buffer.alloc(18);
    header.write('Art-Net\0', 0, 'ascii');
    header.writeUInt16LE(0x5000, 8);          // OpDmx
    header.writeUInt16BE(14, 10);             // 프로토콜 버전
    header[12] = 0;                            // sequence (0 = 사용 안 함)
    header[13] = 0;                            // physical
    header.writeUInt16LE(universe, 14);
    header.writeUInt16BE(512, 16);
    const pkt = Buffer.concat([header, this.frame.subarray(1, 513)]);
    this.socket.send(pkt, 6454, host);
  }

  close() {
    clearInterval(this.timer);
    if (this.port && this.port.isOpen) this.port.close();
    if (this.socket) this.socket.close();
  }
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
