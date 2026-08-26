/**
 * 오디오 엔진 (Web Audio API)
 *
 * 사운드 익스피어리언스는 "들리는 것"이 콘텐츠의 절반이므로, 음원 파일이
 * 아직 없어도 바로 시연할 수 있도록 전 구간을 실시간 합성으로 구현했다.
 *
 *   NOISE BED   도시 소음 (핑크노이즈 + 노면 럼블 + 윈드) → CLEAR 구간에서 소거
 *   SPEAKER PING 25개 스피커가 하나씩 켜지는 포인트음 (스테레오 위치 반영)
 *   PAD          B&O 음색을 상정한 따뜻한 패드 → EXPAND 구간에서 3차원 확산
 *
 * 실제 음원(스템)이 준비되면 config.audio.stems 에 경로를 넣는다.
 * 로드에 성공한 스템은 합성음 대신 재생하고, 실패하면 조용히 합성음으로 되돌아간다.
 */
export class AudioEngine {
  constructor(opts = {}) {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.masterLevel = opts.master ?? 0.9;
    this.stemUrls = opts.stems || {};
    this.stems = new Map();
    this._nodes = {};
  }

  /** 브라우저 정책상 첫 사용자 제스처에서 호출해야 소리가 난다. */
  async unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const master = this.ctx.createGain();
    master.gain.value = this.masterLevel;

    // 전체 톤을 정돈하는 마스터 리미터 대용 컴프레서
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;

    master.connect(comp).connect(this.ctx.destination);
    this._nodes.master = master;

    // 공간감용 간이 리버브 (알고리즈믹 딜레이 네트워크)
    const revIn = this.ctx.createGain();
    const revOut = this.ctx.createGain();
    revOut.gain.value = 0;
    const taps = [0.031, 0.047, 0.071, 0.097];
    taps.forEach((t, i) => {
      const d = this.ctx.createDelay(1);
      d.delayTime.value = t;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.58;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = i % 2 ? 0.7 : -0.7;
      revIn.connect(d);
      d.connect(lp).connect(fb).connect(d);
      lp.connect(pan).connect(revOut);
    });
    revOut.connect(master);
    this._nodes.revIn = revIn;
    this._nodes.revSend = revOut;

    this.ready = true;
    this._loadStems();
  }

  async _loadStems() {
    for (const [name, url] of Object.entries(this.stemUrls)) {
      if (name.startsWith('$')) continue;   // config 의 주석 키
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.stems.set(name, buf);
      } catch (err) {
        console.info(`[audio] 스템 "${name}" 없음 — 합성음으로 대체합니다.`);
      }
    }
  }

  setMuted(on) {
    this.muted = on;
    if (this._nodes.master) {
      this._nodes.master.gain.setTargetAtTime(on ? 0 : this.masterLevel, this.ctx.currentTime, 0.08);
    }
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  /** 파일 스템 재생 (있을 때만). 반환값으로 정지 함수를 준다. */
  playStem(name, { loop = false, gain = 1 } = {}) {
    if (!this.ready || !this.stems.has(name)) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.stems.get(name);
    src.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this._nodes.master);
    src.start();
    return () => { try { src.stop(); } catch (_) {} };
  }

  // --- 노이즈 소스 --------------------------------------------------------

  _noiseBuffer(seconds = 2, kind = 'pink') {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const d = buf.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      // 핑크노이즈 (Paul Kellet 근사)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  _looper(kind) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(3, kind);
    src.loop = true;
    src.start();
    return src;
  }

  // --- STEP 1 : CLEAR — 도시 소음 침투와 소거 -----------------------------

  /** 도시 소음 베드를 켠다. 이미 켜져 있으면 무시. */
  startNoiseBed() {
    if (!this.ready || this._nodes.noise) return;
    const ctx = this.ctx;

    const out = ctx.createGain();
    out.gain.value = 0;

    // 차실로 들어오는 소음을 통제하는 '차체' 필터
    const cabin = ctx.createBiquadFilter();
    cabin.type = 'lowpass';
    cabin.frequency.value = 9000;
    cabin.Q.value = 0.4;
    cabin.connect(out);

    // TRAFFIC — 저역 럼블
    const traffic = this._looper('brown');
    const trafficLp = ctx.createBiquadFilter();
    trafficLp.type = 'lowpass';
    trafficLp.frequency.value = 320;
    const trafficG = ctx.createGain();
    trafficG.gain.value = 0.85;
    traffic.connect(trafficLp).connect(trafficG).connect(cabin);

    // ROAD — 노면 중역
    const road = this._looper('pink');
    const roadBp = ctx.createBiquadFilter();
    roadBp.type = 'bandpass';
    roadBp.frequency.value = 780;
    roadBp.Q.value = 0.7;
    const roadG = ctx.createGain();
    roadG.gain.value = 0.7;
    road.connect(roadBp).connect(roadG).connect(cabin);

    // WIND — 고역, 느리게 출렁이는 LFO
    const wind = this._looper('white');
    const windBp = ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.value = 3400;
    windBp.Q.value = 0.9;
    const windG = ctx.createGain();
    windG.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.12;
    lfo.connect(lfoG).connect(windG.gain);
    lfo.start();
    wind.connect(windBp).connect(windG).connect(cabin);

    out.connect(this._nodes.master);
    out.gain.setTargetAtTime(0.55, ctx.currentTime, 0.9);

    this._nodes.noise = { out, cabin, traffic, road, wind, trafficG, roadG, windG, lfo };
  }

  /**
   * 소음 소거 정도. 0 = 도시 한복판, 1 = 완전한 정숙.
   * 대역별로 다른 속도로 사라지게 해서 "정제된다"는 인상을 만든다.
   */
  setNoiseReduction(t) {
    const n = this._nodes.noise;
    if (!n) return;
    const now = this.ctx.currentTime;
    const tc = 0.35;
    n.cabin.frequency.setTargetAtTime(9000 - 8600 * t, now, tc);
    n.out.gain.setTargetAtTime(0.55 * (1 - t * 0.985), now, tc);
    n.windG.gain.setTargetAtTime(0.22 * (1 - Math.min(t * 1.35, 1)), now, tc); // 윈드가 먼저
    n.roadG.gain.setTargetAtTime(0.70 * (1 - Math.min(t * 1.15, 1)), now, tc);
    n.trafficG.gain.setTargetAtTime(0.85 * (1 - t), now, tc);                  // 럼블이 마지막
  }

  stopNoiseBed(fadeSec = 1.2) {
    const n = this._nodes.noise;
    if (!n) return;
    const now = this.ctx.currentTime;
    n.out.gain.setTargetAtTime(0, now, fadeSec / 4);
    setTimeout(() => {
      [n.traffic, n.road, n.wind, n.lfo].forEach((s) => { try { s.stop(); } catch (_) {} });
      try { n.out.disconnect(); } catch (_) {}
    }, fadeSec * 1000 + 200);
    this._nodes.noise = null;
  }

  // --- STEP 2 : FILL — 스피커 포인트음 ------------------------------------

  /**
   * 스피커 한 개가 켜지는 소리.
   * @param {{pan:number, freq:number, gain:number, height:number}} o
   *        pan -1(좌)~1(우), height 0~1 (높을수록 밝은 배음)
   */
  ping({ pan = 0, freq = 440, gain = 0.5, height = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2, t0);
    osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.09);

    const shine = ctx.createOscillator();
    shine.type = 'triangle';
    shine.frequency.value = freq * (3 + height);

    const shineG = ctx.createGain();
    shineG.gain.value = 0.16 + height * 0.2;
    shine.connect(shineG);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    osc.connect(env);
    shineG.connect(env);
    env.connect(panner).connect(this._nodes.master);
    env.connect(this._nodes.revIn);

    osc.start(t0); shine.start(t0);
    osc.stop(t0 + 1.3); shine.stop(t0 + 1.3);
  }

  // --- STEP 3 : EXPAND — 패드와 3차원 확산 --------------------------------

  /** 따뜻한 패드를 켠다. FILL 후반부터 EXPAND 끝까지 이어진다. */
  startPad() {
    if (!this.ready || this._nodes.pad) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1500;
    tone.Q.value = 0.6;
    tone.connect(out);

    // Amaj7 계열의 열린 보이싱 — 제네시스 톤에 맞춘 따뜻하고 넓은 화음
    const voices = [110, 164.81, 220, 277.18, 329.63, 440].map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? 'sawtooth' : 'triangle';
      osc.frequency.value = f;
      const det = ctx.createOscillator(); // 아주 느린 디튠으로 살아있는 느낌
      det.frequency.value = 0.05 + i * 0.017;
      const detG = ctx.createGain();
      detG.gain.value = 1.6;
      det.connect(detG).connect(osc.detune);
      const g = ctx.createGain();
      g.gain.value = (i < 2 ? 0.09 : 0.13) / 2;
      const p = ctx.createStereoPanner();
      p.pan.value = 0;
      osc.connect(g).connect(p).connect(tone);
      osc.start(); det.start();
      return { osc, g, p, det };
    });

    const send = ctx.createGain();
    send.gain.value = 0.25;
    out.connect(send).connect(this._nodes.revIn);
    out.connect(this._nodes.master);
    out.gain.setTargetAtTime(0.42, ctx.currentTime, 1.6);

    this._nodes.pad = { out, tone, voices, send };
  }

  /**
   * 공간 확장 정도. 0 = 정면의 평면적인 소리, 1 = 머리 위까지 감싸는 3차원.
   * 스테레오 폭 · 리버브 양 · 고역 개방을 함께 밀어 올린다.
   */
  setSpatial(t) {
    const p = this._nodes.pad;
    if (!p) return;
    const now = this.ctx.currentTime;
    p.voices.forEach((v, i) => {
      const spread = ((i % 2 ? 1 : -1) * (0.25 + (i / p.voices.length) * 0.75)) * t;
      v.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, spread)), now, 0.5);
    });
    p.tone.frequency.setTargetAtTime(1500 + 6500 * t, now, 0.6);
    p.send.gain.setTargetAtTime(0.25 + 0.55 * t, now, 0.6);
    this._nodes.revSend.gain.setTargetAtTime(0.18 + 0.5 * t, now, 0.6);
  }

  stopPad(fadeSec = 2) {
    const p = this._nodes.pad;
    if (!p) return;
    const now = this.ctx.currentTime;
    p.out.gain.setTargetAtTime(0, now, fadeSec / 4);
    setTimeout(() => {
      p.voices.forEach((v) => { try { v.osc.stop(); v.det.stop(); } catch (_) {} });
      try { p.out.disconnect(); } catch (_) {}
    }, fadeSec * 1000 + 200);
    this._nodes.pad = null;
  }

  /** 모든 소리를 정리한다 (콘텐츠 리셋 시). */
  reset() {
    this.stopNoiseBed(0.4);
    this.stopPad(0.6);
    if (this._nodes.revSend) {
      this._nodes.revSend.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
  }
}
