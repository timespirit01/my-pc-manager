// Vercel 서버리스 함수: POST /api/token
import { issueToken } from '../lib/issue-token.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ code: 'method' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const out = await issueToken(body || {});
  res.status(out.status).json(out.body);
}
