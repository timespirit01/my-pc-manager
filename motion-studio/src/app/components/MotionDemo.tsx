// 움직임 설정을 말 대신 보여주는 작은 예시. 실제 영상과 같은 motionProfile/enter 함수를 쓴다.
import { useEffect, useRef } from 'react';
import { enter, motionProfile } from '../../core/motion';
import type { MotionSettings } from '../../core/types';

export function MotionDemo({ motion, color }: { motion: MotionSettings; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 240 * dpr;
    c.height = 72 * dpr;
    const mp = motionProfile(motion);
    const cycle = 0.3 + 2 * mp.stagger + mp.enterDur + 1.2;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = ((now - t0) / 1000) % cycle;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, 240, 72);
      // 1080p 기준 이동 거리를 작은 캔버스에 맞게 축소
      const k = 0.28;
      for (let i = 0; i < 3; i++) {
        const s = enter(mp, t, 0.3, i, 'up');
        ctx.save();
        ctx.globalAlpha = s.opacity;
        const x = 20 + i * 72, y = 18 + s.dy * k;
        ctx.translate(x + 26, y + 18);
        ctx.scale(s.scale, s.scale);
        ctx.fillStyle = i === 0 ? color : '#C9CCD6';
        ctx.beginPath();
        ctx.roundRect(-26, -18, 52, 36, 8);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motion, color]);
  return <canvas ref={ref} className="motion-demo" style={{ width: 240, height: 72 }} />;
}
