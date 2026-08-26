/**
 * 두 모니터 사이의 상태 동기화.
 *
 * 전시장에서는 한 PC 에 터치모니터와 대형모니터를 물리고,
 * 브라우저 창을 각각 하나씩 띄운다. 같은 출처라면 BroadcastChannel 로
 * 서버 없이 동기화된다.
 *
 *   터치모니터  상태를 바꾸고 알린다 (컨트롤러)
 *   대형모니터  받은 상태를 그대로 그린다 (팔로워)
 *
 * 대형모니터가 나중에 켜지거나 새로고침돼도 hello 를 보내면
 * 터치모니터가 현재 상태를 다시 알려주므로 곧바로 따라붙는다.
 */
export class SyncBus {
  /**
   * @param {string} channel 채널 이름
   * @param {{role:'controller'|'follower', store:import('./store.js').Store}} opts
   */
  constructor(channel, { role, store }) {
    this.role = role;
    this.store = store;
    this.applying = false;
    this.bc = 'BroadcastChannel' in window ? new BroadcastChannel(channel) : null;

    if (!this.bc) {
      console.warn('[sync] BroadcastChannel 을 쓸 수 없어 두 화면이 따로 동작합니다.');
      return;
    }

    this.bc.onmessage = (ev) => this._receive(ev.data);

    if (role === 'controller') {
      // 상태가 바뀔 때마다 알린다 (동기화로 들어온 변경은 되돌려 보내지 않는다)
      store.subscribe((state, prev, meta) => {
        if (!prev || this.applying || (meta && meta.local === false)) return;
        this._send({ type: 'state', state });
      });
    } else {
      this._send({ type: 'hello' });
    }
  }

  _send(msg) {
    if (this.bc) this.bc.postMessage(msg);
  }

  _receive(msg) {
    if (!msg) return;
    if (msg.type === 'hello' && this.role === 'controller') {
      this._send({ type: 'state', state: this.store.state });
      return;
    }
    if (msg.type === 'state' && this.role === 'follower') {
      this.applying = true;
      this.store.set(msg.state, { local: false });
      this.applying = false;
    }
  }

  destroy() {
    if (this.bc) this.bc.close();
  }
}
