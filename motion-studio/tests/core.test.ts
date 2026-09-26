// 핵심 로직 단위 테스트 (브라우저 없이 실행: npm test)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeScenes, splitScene, makeScene } from '../src/core/compose';
import { getFormat } from '../src/core/formats';
import { coverSource } from '../src/core/imageFit';
import { enter, motionProfile } from '../src/core/motion';
import { createProject, normalizeProject } from '../src/core/project';
import { sampleMaterial } from '../src/core/samples';
import { fitText, wrapText, type Measure } from '../src/core/text';
import { computeTimeline, frameState } from '../src/core/timing';
import { TEMPLATES } from '../src/core/templates';
import type { RenderEnv } from '../src/core/templates/types';
import type { Project, Scene } from '../src/core/types';

// 가짜 측정기: 한글/전각 1em, 영문·숫자 0.55em, 공백 0.28em
const fakeMeasure: Measure = (text, font, ls) => {
  const size = Number(font.match(/([\d.]+)px/)![1]);
  let w = 0;
  for (const ch of text) w += (/\s/.test(ch) ? 0.28 : /[ㄱ-힝]/.test(ch) ? 1 : 0.55) * size + ls;
  return w - (text.length ? ls : 0);
};

const m = (s: string) => fakeMeasure(s, '400 10px "X"', 0);

test('한글 줄바꿈은 띄어쓰기 단위를 지키고 금칙 문자로 줄을 시작하지 않는다', () => {
  const lines = wrapText('매일 아침 갓 볶은 커피 한 잔을 드립니다', 60, m);
  for (const l of lines) assert.ok(m(l) <= 60 + 1e-6, `폭 초과: ${l}`);
  assert.equal(lines.join(' '), '매일 아침 갓 볶은 커피 한 잔을 드립니다');
  const long = wrapText('가나다라마바사아자차카타파하.가나다', 50, m);
  for (const l of long) assert.ok(!/^[.,!?]/.test(l), `금칙 문자로 시작: ${l}`);
});

test('fitText는 최소 크기 아래로 줄이지 않고 넘치면 overflow를 표시한다', () => {
  const spec = { family: 'X', weight: 800, sizes: [100, 90, 80], lineHeight: 1.2, letterSpacing: 0, maxWidth: 500, maxLines: 2 };
  const short = fitText('짧은 제목', spec, fakeMeasure);
  assert.equal(short.size, 100);
  assert.equal(short.overflow, false);
  const long = fitText('아주 긴 한글 제목이 계속 이어져서 두 줄 안에는 절대로 들어갈 수가 없는 문장입니다', spec, fakeMeasure);
  assert.equal(long.size, 80);
  assert.equal(long.overflow, true);
  assert.equal(long.lines.length, 2);
  assert.ok(long.lines[1].endsWith('…'));
});

test('이미지 cover 자르기는 비율을 유지하고 원본 범위를 벗어나지 않는다', () => {
  const cases: Array<[number, number]> = [[3000, 1000], [900, 1800], [1400, 1400], [1920, 1080]];
  for (const [iw, ih] of cases) {
    for (const box of [{ w: 800, h: 900 }, { w: 1600, h: 600 }]) {
      for (const crop of [{ focusX: 0, focusY: 0, zoom: 1 }, { focusX: 1, focusY: 1, zoom: 2 }, { focusX: 0.3, focusY: 0.7, zoom: 1.4 }]) {
        const s = coverSource(iw, ih, box, crop);
        assert.ok(Math.abs(s.sw / s.sh - box.w / box.h) < 1e-6, '가로세로 비율 불일치(찌그러짐)');
        assert.ok(s.sx >= -1e-6 && s.sy >= -1e-6 && s.sx + s.sw <= iw + 1e-6 && s.sy + s.sh <= ih + 1e-6, '원본 범위 초과');
      }
    }
  }
});

test('움직임 선택지가 속도·거리·곡선에 일관되게 연결된다', () => {
  const base = { feel: 'smooth', speed: 'normal', emphasis: 'normal' } as const;
  const slow = motionProfile({ ...base, speed: 'slow' }), normal = motionProfile(base), fast = motionProfile({ ...base, speed: 'fast' });
  assert.ok(slow.enterDur > normal.enterDur && normal.enterDur > fast.enterDur);
  assert.ok(slow.transitionDur > normal.transitionDur && normal.transitionDur > fast.transitionDur);
  const lo = motionProfile({ ...base, emphasis: 'low' }), hi = motionProfile({ ...base, emphasis: 'high' });
  assert.ok(lo.distance < normal.distance && normal.distance < hi.distance);
  assert.ok(lo.kenBurns < hi.kenBurns && lo.scaleFrom > hi.scaleFrom);
  // 경쾌하게는 목표를 살짝 지나쳤다 돌아온다(오버슈트), 차분하게는 그렇지 않다
  const lively = motionProfile({ ...base, feel: 'lively' }), calm = motionProfile({ ...base, feel: 'calm' });
  const peak = (mp: typeof lively) => Math.max(...Array.from({ length: 50 }, (_, i) => mp.enter(i / 49)));
  assert.ok(peak(lively) > 1.01);
  assert.ok(peak(calm) <= 1.0001);
  // 등장 완료 후 위치는 정확히 제자리
  const done = enter(lively, 10, 0, 0, 'up');
  assert.equal(done.dy, 0);
  assert.equal(done.opacity, 1);
});

test('영상 길이를 바꿔도 등장 애니메이션 타이밍은 유지되고 총 길이는 정확하다', () => {
  const p = createProject(sampleMaterial('product'), composeScenes(sampleMaterial('product')), 'bold');
  const mp = motionProfile(p.motion);
  const a = computeTimeline(p.scenes, 20, mp);
  const b = computeTimeline(p.scenes, 30, mp);
  assert.equal(a.scenes.at(-1)!.end, 20);
  assert.equal(b.scenes.at(-1)!.end, 30);
  a.scenes.forEach((s, i) => {
    assert.equal(s.readyAt, b.scenes[i].readyAt, '등장 완료 시점이 영상 길이에 따라 변함');
    assert.ok(b.scenes[i].dur >= s.dur, '길이를 늘렸는데 장면이 짧아짐');
  });
  // 모든 시점이 정확히 하나의 장면(전환 중이면 두 장면)에 속한다
  for (let t = 0; t < 20; t += 0.05) {
    const fs = frameState(a, t);
    assert.ok(fs.current.localT >= 0 && fs.current.localT <= fs.current.timing.dur + 1e-6);
    if (fs.incoming) assert.ok(fs.transition >= 0 && fs.transition <= 1);
  }
});

test('자동 구성: 도입 → 핵심 내용 → 강조 → 행동 유도, 긴 설명은 장면을 나눈다', () => {
  const scenes = composeScenes(sampleMaterial('product'));
  assert.equal(scenes[0].kind, 'intro');
  assert.equal(scenes.at(-1)!.kind, 'cta');
  assert.ok(scenes.some((s) => s.kind === 'feature'));
  assert.ok(scenes.some((s) => s.kind === 'highlight'));
  const long = composeScenes({
    ...sampleMaterial('service'),
    description: '첫 번째 문장은 서비스의 장점을 설명합니다. 두 번째 문장은 예약 방법을 설명합니다. 세 번째 문장은 가격 정책을 설명합니다. 네 번째 문장은 후기를 소개합니다.',
  });
  const features = long.filter((s) => s.kind === 'feature');
  assert.ok(features.length >= 2);
  for (const f of features) assert.ok(f.body.length <= 80, `설명이 너무 김: ${f.body}`);
});

test('장면 나누기: 긴 제목·설명 모두 두 장면으로 나뉘고 내용이 보존된다', () => {
  const s = makeScene('feature', { title: '짧은 소제목', body: '첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.' });
  const [a, b] = splitScene(s)!;
  assert.equal(`${a.body} ${b.title} ${b.body}`.replace(/\s+/g, ' ').trim(), s.body);
  const t = makeScene('intro', { title: '우리 동네에서 가장 신선한 원두를 매일 아침 직접 볶아 보내드립니다', body: '' });
  const [c, d] = splitScene(t)!;
  assert.equal(`${c.title} ${d.title}`, t.title);
});

test('저장한 프로젝트를 다시 열면 편집 상태가 그대로 복원된다', () => {
  const p = createProject(sampleMaterial('event'), composeScenes(sampleMaterial('event')), 'pop');
  p.scenes[1].crop = { focusX: 0.2, focusY: 0.8, zoom: 1.6 };
  p.colors = { primary: '#123456', accent: '#ABCDEF' };
  p.motion = { feel: 'calm', speed: 'fast', emphasis: 'high' };
  // 저장 형식(JSON) 기준으로 비교: 값이 undefined인 키는 저장되지 않는다
  const saved = JSON.parse(JSON.stringify(p));
  const back = normalizeProject(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(back)), saved);
});

// ---------- 레이아웃: 긴 한글 제목·가로/세로 사진에서도 글과 사진이 겹치지 않는다 ----------
function envFor(p: Project): RenderEnv {
  const t = TEMPLATES.find((x) => x.id === p.templateId)!;
  const mp = motionProfile(p.motion);
  return {
    ctx: null as never, project: p, format: getFormat(p.format), palette: t.palette(p.colors), mp,
    measure: fakeMeasure, timeline: computeTimeline(p.scenes, p.duration, mp), globalT: 0, image: () => undefined,
  };
}

type AnyLayout = Record<string, any>;

function textRect(L: AnyLayout) {
  const blocks = [L.title, L.body].filter((b) => b && b.lines.length);
  const w = Math.max(...blocks.map((b) => b.width), 0);
  const x0 = L.align === 'center' ? L.textX - w / 2 : L.textX;
  return { x0, x1: x0 + w };
}

test('모든 템플릿: 긴 제목과 극단적 사진 비율에서도 글과 사진이 겹치지 않고 화면 안에 있다', () => {
  const titles = ['짧은 제목', '우리 동네에서 가장 신선한 원두를 매일 아침 직접 볶아 보내드리는 핸드드립 세트'];
  const images = {
    pano: { id: 'pano', url: '', name: 'pano', width: 3000, height: 1000 },
    tall: { id: 'tall', url: '', name: 'tall', width: 900, height: 1800 },
  };
  for (const t of TEMPLATES) {
    for (const title of titles) {
      for (const img of ['pano', 'tall', undefined]) {
        const scenes: Scene[] = [
          makeScene('intro', { title, body: '한 줄 소개 문구', imageId: img }),
          makeScene('feature', { title, body: '설명 문장입니다. 두 번째 설명 문장입니다.', imageId: img }),
          makeScene('highlight', { title: '첫 주문 30% 할인' }),
          makeScene('cta', { title: '지금 만나보세요', body: 'example.com', button: '주문하기' }),
        ];
        const p: Project = { ...createProject(sampleMaterial('product'), scenes, t.id), assets: images };
        const env = envFor(p);
        scenes.forEach((s, i) => {
          const L = t.layout(env, s, i) as AnyLayout;
          const tr = textRect(L);
          assert.ok(tr.x0 >= 0 && tr.x1 <= 1920, `${t.id}/${s.kind}: 글이 화면 밖`);
          assert.ok(L.top >= 0 && L.top < 1080, `${t.id}/${s.kind}: 세로 위치 이상`);
          const im = L.image ?? L.sticker;
          if (im && L.title.lines.length) {
            const overlap = Math.min(tr.x1, im.x + im.w) - Math.max(tr.x0, im.x);
            assert.ok(overlap <= 0, `${t.id}/${s.kind}/${img}: 글(${tr.x0.toFixed(0)}~${tr.x1.toFixed(0)})과 사진(${im.x}~${im.x + im.w})이 겹침`);
          }
          if (L.title.lines.length) assert.ok(L.title.size >= 60, `${t.id}: 제목이 너무 작아짐 ${L.title.size}`);
          if (L.body?.lines.length) assert.ok(L.body.size >= 34, `${t.id}: 본문이 너무 작아짐 ${L.body.size}`);
        });
      }
    }
  }
});

test('어떤 브랜드 색을 골라도 주요 글자는 배경 대비 3:1 이상 (큰 글씨 기준)', async () => {
  const { contrast } = await import('../src/core/color');
  const colors = ['#FFFFFF', '#000000', '#FFFF00', '#00FF00', '#E0602F', '#3A86FF', '#7048E8', '#F5C04A', '#808080', '#2E7D5B', '#FFC0CB'];
  for (const t of TEMPLATES) {
    for (const primary of colors) {
      for (const accent of colors) {
        const pal = t.palette({ primary, accent });
        assert.ok(contrast(pal.text, pal.bg) >= 3, `${t.id} text/bg ${primary}`);
        assert.ok(contrast(pal.onPrimary, pal.primary) >= 3, `${t.id} onPrimary ${primary}`);
        assert.ok(contrast(pal.onAccent, pal.accent) >= 3, `${t.id} onAccent ${accent}`);
        assert.ok(contrast(pal.primaryOnBg, t.id === 'pop' ? '#FFFFFF' : pal.bg) >= 3, `${t.id} primaryOnBg ${primary}`);
      }
    }
  }
});
