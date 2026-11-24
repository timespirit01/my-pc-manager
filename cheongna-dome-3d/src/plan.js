// 층별 2D 좌석 배치도: 구역을 누르면 확대, 좌석을 누르면 그 자리 시야로 이동
const $ = (q) => document.querySelector(q);
const SEAT_AT = 8, NUM_AT = 24, ROW_AT = 13;        // 이 배율(px/m) 이상에서 좌석 / 번호 / 열 표시

export function createPlan({ sections, fieldPoly, fencePoly, polePts, centerZ, current, onPick }) {
  const dlg = $('#plan'), cv = $('#planCv'), g = cv.getContext('2d');
  let floor = 1, W = 0, H = 0, dpr = 1, base = 1, v = { x: 0, z: centerZ, s: 1 };
  for (const s of sections) {
    const r0 = s.seats.filter((q) => q.row === s.seats[0].row), r1 = s.seats.filter((q) => q.row === s.seats.at(-1).row);
    s.quad = [r0[0], r0.at(-1), r1.at(-1), r1[0]];
    const xs = s.seats.map((q) => q.x), zs = s.seats.map((q) => q.z);
    s.box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    s.rowStart = {}; for (const q of s.seats) if (!s.rowStart[q.row]) s.rowStart[q.row] = [q, null]; for (const q of s.seats) s.rowStart[q.row][1] = q;
  }
  const X = (x) => W / 2 + (x - v.x) * v.s, Z = (z) => H / 2 + (z - v.z) * v.s;
  const onFloor = () => sections.filter((s) => s.floor === floor);
  const clampS = (s) => Math.min(64, Math.max(base * 0.85, s));

  function size() { const r = cv.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; base = Math.min(W, H) / 250; }
  function reset() { v = { x: 0, z: centerZ, s: base }; draw(); }
  function fit(s) { const [x0, z0, x1, z1] = s.box; v.x = (x0 + x1) / 2; v.z = (z0 + z1) / 2; v.s = clampS((Math.min(W, H) * 0.82) / (Math.max(x1 - x0, z1 - z0) + 3)); draw(); }
  function zoomAt(k, px = W / 2, py = H / 2) { const wx = v.x + (px - W / 2) / v.s, wz = v.z + (py - H / 2) / v.s; v.s = clampS(v.s * k); v.x = wx - (px - W / 2) / v.s; v.z = wz - (py - H / 2) / v.s; draw(); }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = '#10141b'; g.fillRect(0, 0, W, H);
    g.beginPath(); fieldPoly.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.closePath(); g.fillStyle = '#7c5a3c'; g.fill();
    g.save(); g.clip(); g.beginPath(); g.moveTo(X(0), Z(2)); g.lineTo(X(160), Z(-158)); g.lineTo(X(-160), Z(-158)); g.closePath(); g.fillStyle = '#2f6b33'; g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.beginPath(); for (const p of polePts) { g.moveTo(X(0), Z(0)); g.lineTo(X(p.x), Z(p.z)); } g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('홈', X(0), Z(6)); g.fillText('외야', X(0), Z(-95)); g.fillText('호텔', X(-88), Z(-52)); g.fillText('전광판', X(-38), Z(-128)); g.fillText('쇼핑몰', X(72), Z(-98));
    const cur = current(), seatsOn = v.s >= SEAT_AT;
    for (const s of sections) if (s.floor !== floor) {            // 다른 층은 윤곽만
      g.beginPath(); s.quad.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z)))); g.closePath(); g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.stroke();
    }
    for (const s of onFloor()) {
      const [x0, z0, x1, z1] = s.box; if (X(x1) < -30 || X(x0) > W + 30 || Z(z1) < -30 || Z(z0) > H + 30) continue;
      const isCur = cur.section === s;
      g.beginPath(); s.quad.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z)))); g.closePath();
      g.globalAlpha = seatsOn ? 0.16 : 0.9; g.fillStyle = s.g.color; g.fill(); g.globalAlpha = 1;
      g.lineWidth = isCur ? 2.5 : 1; g.strokeStyle = isCur ? '#ffd400' : 'rgba(255,255,255,.35)'; g.stroke();
      if (seatsOn) {
        const r = Math.max(1.6, 0.21 * v.s), num = v.s >= NUM_AT;
        g.font = `${Math.round(0.24 * v.s)}px sans-serif`;
        for (const q of s.seats) {
          const px = X(q.x), py = Z(q.z); if (px < -r || px > W + r || py < -r || py > H + r) continue;
          g.beginPath(); g.arc(px, py, r, 0, 7); g.fillStyle = cur.seat === q ? '#ffd400' : s.g.color; g.fill();
          if (num) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.stroke(); g.fillStyle = cur.seat === q ? '#111' : '#fff'; g.fillText(q.num, px, py + 0.5); }
        }
        if (v.s >= ROW_AT) {
          g.fillStyle = '#c9d0db'; g.font = `bold ${Math.round(Math.min(13, 0.3 * v.s + 4))}px sans-serif`;
          for (const [row, [a, b]] of Object.entries(s.rowStart)) {      // 1번 좌석 쪽 끝에만 표시 (옆 구역 라벨과 겹치지 않게)
            const dx = a.x - b.x, dz = a.z - b.z, L = Math.hypot(dx, dz) || 1; g.fillText(row + '열', X(a.x + (dx / L) * 0.8), Z(a.z + (dz / L) * 0.8));
          }
        }
      }
      const cx = X((x0 + x1) / 2), cy = Z((z0 + z1) / 2), wpx = (x1 - x0 + z1 - z0) * v.s * 0.5;
      if (!seatsOn && wpx > 16) { g.font = `bold ${Math.round(Math.min(18, Math.max(9, wpx * 0.3)))}px sans-serif`; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeText(s.id, cx, cy); g.fillText(s.id, cx, cy); }
      else if (seatsOn) { g.font = 'bold 13px sans-serif'; g.fillStyle = '#ffd400'; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3; const ty = Z(z0) - 12; g.strokeText(`${s.id}구역`, cx, ty); g.fillText(`${s.id}구역`, cx, ty); }
    }
    $('#planHint').textContent = seatsOn ? '좌석을 누르면 그 자리에서 보는 시야로 이동합니다' : '구역을 누르면 확대됩니다 · 휠/핀치로 확대, 드래그로 이동';
  }

  function pick(px, py) {
    const x = v.x + (px - W / 2) / v.s, z = v.z + (py - H / 2) / v.s;
    if (v.s >= SEAT_AT) {
      let best = null, bd = 0.5;
      for (const s of onFloor()) { const [x0, z0, x1, z1] = s.box; if (x < x0 - 1 || x > x1 + 1 || z < z0 - 1 || z > z1 + 1) continue; s.seats.forEach((q, i) => { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = [s, i]; } }); }
      if (best) return { seat: best };
    }
    let sec = null, bd = 9;
    for (const s of onFloor()) { const [x0, z0, x1, z1] = s.box, d = Math.hypot((x0 + x1) / 2 - x, (z0 + z1) / 2 - z); if (d < bd) { bd = d; sec = s; } }
    return sec ? { section: sec } : null;
  }

  const ptrs = new Map(); let down = null, pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e); down = { x: e.clientX, y: e.clientY, moved: false }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, e);
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), r = cv.getBoundingClientRect(); if (down) down.moved = true; zoomAt(d / pinch, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top); pinch = d; }
    else if (down && down.moved) { v.x -= (e.clientX - prev.clientX) / v.s; v.z -= (e.clientY - prev.clientY) / v.s; draw(); }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId); const d = down; if (ptrs.size === 0) down = null;
    if (!d || d.moved || e.type === 'pointercancel') return;
    const r = cv.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top); if (!h) return;
    if (h.seat) onPick(h.seat[0], h.seat[1]); else fit(h.section);
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.deltaY > 0 ? 0.87 : 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $('#planIn').onclick = () => zoomAt(1.5); $('#planOut').onclick = () => zoomAt(1 / 1.5); $('#planReset').onclick = reset;
  $('#planClose').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  const tabs = $('#planFloors');
  function setFloor(f) { floor = f; tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.f === f)); draw(); }
  for (const f of [...new Set(sections.map((s) => s.floor))].sort()) {
    const b = document.createElement('button'); b.dataset.f = f; b.textContent = `${f}층`; b.onclick = () => setFloor(f); tabs.append(b);
  }
  addEventListener('resize', () => { if (dlg.open) { size(); draw(); } });

  return {
    open() {
      dlg.showModal(); size();
      const c = current();
      if (c.section) { floor = c.section.floor; setFloor(floor); fit(c.section); } else { setFloor(floor); reset(); }
    },
    close: () => dlg.close(),
  };
}
