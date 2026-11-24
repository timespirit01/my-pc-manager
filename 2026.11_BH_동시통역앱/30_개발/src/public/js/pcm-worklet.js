// 마이크 음성을 목표 샘플레이트의 16비트 PCM 조각으로 바꿔 메인 스레드로 보낸다.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.targetRate = o.targetRate || 16000;
    this.chunk = Math.max(1, Math.round((this.targetRate * (o.chunkMs || 40)) / 1000));
    this.ratio = sampleRate / this.targetRate; // 입력 표본 몇 개가 출력 표본 하나가 되는지
    this.buf = new Int16Array(this.chunk);
    this.n = 0;
    this.acc = 0;
    this.accN = 0;
    this.pos = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      // 구간 평균으로 낮춰서 높은 주파수가 접히는 것을 줄인다.
      this.acc += ch[i];
      this.accN++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        let s = this.acc / this.accN;
        this.acc = 0;
        this.accN = 0;
        if (s > 1) s = 1;
        else if (s < -1) s = -1;
        this.sumSq += s * s;
        this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.n === this.chunk) {
          const rms = Math.sqrt(this.sumSq / this.chunk);
          const out = this.buf;
          this.port.postMessage({ pcm: out.buffer, rms }, [out.buffer]);
          this.buf = new Int16Array(this.chunk);
          this.n = 0;
          this.sumSq = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
