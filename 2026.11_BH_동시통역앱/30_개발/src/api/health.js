// Vercel 서버리스 함수: GET /api/health  (설정 상태 확인. 비밀 값은 내보내지 않는다)
import { checkHealth } from '../lib/issue-token.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const engine = !!(req.query && req.query.engine === '1');
  res.status(200).json(await checkHealth({ engine }));
}
