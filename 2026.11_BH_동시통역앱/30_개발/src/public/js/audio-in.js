// 마이크 → 16비트 PCM 조각.

const loadedContexts = new WeakSet();

export class MicInput {
  constructor(ctx, { rate, chunkMs, onChunk, processing = true }) {
    this.ctx = ctx;
    this.rate = rate;
    this.chunkMs = chunkMs;
    this.onChunk = onChunk;
    this.processing = processing;
    this.stream = null;
    this.node = null;
    this.source = null;
  }

  get active() {
    return !!this.stream;
  }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Object.assign(new Error('getUserMedia unavailable'), { code: 'mic-unsupported' });
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: this.processing,
          noiseSuppression: this.processing,
          autoGainControl: this.processing,
        },
      });
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      const missing = e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError');
      throw Object.assign(new Error('mic failed'), {
        code: denied ? 'mic-denied' : missing ? 'mic-missing' : 'mic-failed',
      });
    }
    if (!loadedContexts.has(this.ctx)) {
      await this.ctx.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
      loadedContexts.add(this.ctx);
    }
    this.stream = stream;
    this.source = this.ctx.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(this.ctx, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { targetRate: this.rate, chunkMs: this.chunkMs },
    });
    this.node.port.onmessage = (e) => this.onChunk(e.data.pcm, e.data.rms);
    this.source.connect(this.node);
  }

  stop() {
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
    }
    if (this.source) this.source.disconnect();
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.node = null;
    this.source = null;
    this.stream = null;
  }
}
