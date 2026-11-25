// Vercel 서버리스 함수: GET /api/selftest?t=<SELFTEST_TOKEN>  (진단용. 평소에는 꺼 둔다)
import { runSelfTest } from '../lib/selftest.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const expected = process.env.SELFTEST_TOKEN;
  const q = req.query || {};
  if (!expected || q.t !== expected) {
    res.status(404).json({ code: 'not_found' });
    return;
  }
  try {
    res.status(200).json(await runSelfTest(q));
  } catch (e) {
    res.status(200).json({ error: String((e && e.stack) || e).slice(0, 800) });
  }
}
