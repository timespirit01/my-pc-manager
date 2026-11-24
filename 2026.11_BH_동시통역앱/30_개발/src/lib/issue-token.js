// 임시 토큰 발급. API 키는 이 서버 코드에만 있고 브라우저로는 내려가지 않는다.
// 브라우저는 여기서 받은 1회용 주소로 통역 엔진에 직접 접속한다.
//
// 환경 변수
//   GEMINI_API_KEY   (필수) Gemini API 키
//   APP_PASSCODE     접속 암호. Vercel 배포에서는 필수 (없으면 발급을 거부한다)
//   GEMINI_API_BASE  (선택) 토큰 발급 주소를 바꿀 때. 기본은 Google
//   GEMINI_WS_BASE   (선택) 통역 엔진 접속 주소를 바꿀 때. 기본은 Google

import { createHash, timingSafeEqual } from 'node:crypto';

const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_WS_BASE = 'wss://generativelanguage.googleapis.com';
// 임시 토큰은 v1alpha의 Constrained 엔드포인트에서만 쓸 수 있다 (@google/genai 3.6.1 소스 기준).
const WS_PATH = '/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

const TOKEN_LIFETIME_MS = 30 * 60 * 1000; // 이 시간 안에서만 세션을 유지할 수 있다
const START_WINDOW_MS = 60 * 1000; // 발급 후 이 시간 안에 접속을 시작해야 한다

function safeEqual(a, b) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function issueToken(body, env = process.env, fetchImpl = fetch) {
  const required = env.APP_PASSCODE || '';
  if (!required && env.VERCEL) {
    // 암호 없이 공개 배포하면 주소를 아는 누구나 요금을 쓸 수 있다.
    return { status: 500, body: { code: 'config', detail: 'APP_PASSCODE' } };
  }
  const given = body && typeof body.passcode === 'string' ? body.passcode : '';
  if (required && !safeEqual(given, required)) return { status: 401, body: { code: 'passcode' } };

  const key = env.GEMINI_API_KEY;
  if (!key) return { status: 500, body: { code: 'config', detail: 'GEMINI_API_KEY' } };

  const apiBase = env.GEMINI_API_BASE || DEFAULT_API_BASE;
  const wsBase = env.GEMINI_WS_BASE || DEFAULT_WS_BASE;
  const now = Date.now();

  let res;
  try {
    res = await fetchImpl(`${apiBase}/v1alpha/auth_tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + TOKEN_LIFETIME_MS).toISOString(),
        newSessionExpireTime: new Date(now + START_WINDOW_MS).toISOString(),
      }),
    });
  } catch {
    return { status: 502, body: { code: 'upstream', detail: 'unreachable' } };
  }

  if (!res.ok) {
    let reason = '';
    try {
      const j = await res.json();
      const info = j && j.error && Array.isArray(j.error.details) ? j.error.details.find((d) => d && d.reason) : null;
      reason = (info && info.reason) || (j && j.error && j.error.status) || '';
    } catch {
      /* 본문이 JSON이 아님 */
    }
    return { status: 502, body: { code: 'upstream', detail: `${res.status} ${reason}`.trim() } };
  }

  let name = '';
  try {
    name = (await res.json()).name || '';
  } catch {
    /* 아래에서 처리 */
  }
  if (!name) return { status: 502, body: { code: 'upstream', detail: 'no token' } };

  return {
    status: 200,
    body: { wsUrl: `${wsBase}${WS_PATH}?access_token=${encodeURIComponent(name)}` },
  };
}
