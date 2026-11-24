// 통역 음성(PCM 조각)을 받는 즉시 끊김 없이 이어서 재생한다.

export class PcmPlayer {
  constructor(ctx, { leadMs = 20 } = {}) {
    this.ctx = ctx;
    this.lead = leadMs / 1000;
    this.nextTime = 0;
    this.busyUntil = {}; // tag → 그 방향의 음성이 끝나는 시각
    this.sources = new Set();
  }

  // 반환값: 이 조각이 실제로 들리기 시작할 때까지 남은 시간(초)
  enqueue(int16, rate, tag) {
    if (!int16.length) return 0;
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
    const buf = this.ctx.createBuffer(1, f32.length, rate);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    const at = Math.max(now + this.lead, this.nextTime);
    src.start(at);
    this.nextTime = at + buf.duration;
    this.busyUntil[tag] = this.nextTime;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    return at - now;
  }

  // 지금(또는 tailSec 이내에) 재생 중인 방향. 없으면 null.
  playingTag(tailSec = 0) {
    const now = this.ctx.currentTime;
    let best = null;
    let bestT = -Infinity;
    for (const tag of Object.keys(this.busyUntil)) {
      const t = this.busyUntil[tag];
      if (t + tailSec > now && t > bestT) {
        best = tag;
        bestT = t;
      }
    }
    return best;
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* 이미 끝난 조각 */
      }
    }
    this.sources.clear();
    this.nextTime = 0;
    this.busyUntil = {};
  }
}
