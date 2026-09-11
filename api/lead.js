// Vercel 서버리스 함수: POST /api/lead
import { handleLead, clientIp } from '../lib/lead.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST만 허용됩니다.' });
  }

  // Vercel은 Content-Type: application/json을 파싱해 req.body에 넣어준다.
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};

  // Vercel 엣지가 x-forwarded-for를 덮어쓰므로 여기서는 신뢰할 수 있다.
  const ip = clientIp(req.headers, req.socket?.remoteAddress, true);

  const { status, body: payload } = await handleLead(body, ip);
  if (status === 429 && payload.retryAfter) res.setHeader('Retry-After', String(payload.retryAfter));
  return res.status(status).json(payload);
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
