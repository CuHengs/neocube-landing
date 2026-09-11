// 상담 신청 처리 로직. api/lead.js(Vercel)와 server.js(로컬)가 공유한다.
// Airtable 토큰은 이 모듈 안에서만 읽으며, 클라이언트로 나가는 응답에는 절대 포함하지 않는다.
import { notifyLead } from './telegram.js';

const AIRTABLE_API = 'https://api.airtable.com/v0';

// 토큰·베이스·테이블 식별자는 모두 환경 변수(.env)에서만 읽는다. 코드에 기본값을 두지 않는다.
const REQUIRED_ENV = ['AIRTABLE_TOKEN', 'AIRTABLE_BASE_ID', 'AIRTABLE_LEADS_TABLE_ID'];

/** 누락된 환경 변수 이름 목록. 기동 시 점검용으로도 쓴다. */
export function missingEnv() {
  return REQUIRED_ENV.filter((key) => !process.env[key]);
}

// Airtable '관심서비스' singleSelect 옵션과 정확히 일치해야 한다.
const SERVICES = new Set([
  '업무 진단',
  '프로세스 재설계',
  '사내 업무 도구 개발',
  '실행 대행(리테이너)',
  '단기 자문',
  '아직 모르겠음',
]);

// Airtable '유입경로' singleSelect 옵션과 정확히 일치해야 한다.
const SOURCES = new Set(['폼', '챗봇']);

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;

// ponytail: 프로세스 메모리 기반 rate limit. 서버리스 인스턴스마다 카운터가 따로 놀고
// 콜드 스타트로 초기화된다. 분산 환경에서 엄밀한 차단이 필요해지면 Upstash Redis 등으로 교체.
const hits = new Map();

export function checkRateLimit(ip, now = Date.now()) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  // 창을 벗어난 IP 정리 (Map 무한 증가 방지)
  for (const [key, times] of hits) {
    const alive = times.filter((t) => t > cutoff);
    if (alive.length === 0) hits.delete(key);
    else hits.set(key, alive);
  }

  const recent = hits.get(ip) || [];
  if (recent.length >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((recent[0] + RATE_LIMIT_WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true };
}

export function resetRateLimit() {
  hits.clear();
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** 클라이언트 검증을 믿지 않고 서버에서 다시 검증한다. */
export function validate(body) {
  const errors = {};

  const name = str(body.name);
  if (name.length < 1) errors.name = '이름을 입력해 주세요.';
  else if (name.length > 100) errors.name = '이름은 100자 이내로 입력해 주세요.';

  const phone = str(body.phone);
  const digits = phone.replace(/\D/g, '');
  if (phone.length < 1) errors.phone = '연락처를 입력해 주세요.';
  else if (!/^[0-9+\-() .]+$/.test(phone)) errors.phone = '연락처에 사용할 수 없는 문자가 있습니다.';
  else if (digits.length < 9 || digits.length > 15) errors.phone = '연락처 형식을 확인해 주세요.';

  const email = str(body.email);
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    errors.email = '이메일 형식을 확인해 주세요.';
  }

  const company = str(body.company);
  if (company.length > 200) errors.company = '회사명은 200자 이내로 입력해 주세요.';

  const service = str(body.service);
  if (service && !SERVICES.has(service)) errors.service = '관심 서비스 값이 올바르지 않습니다.';

  const message = str(body.message);
  if (message.length > 5000) errors.message = '문의내용은 5000자 이내로 입력해 주세요.';

  // 유입경로는 Airtable singleSelect 옵션과 같아야 한다. 목록 밖 값은 무시하고 '폼'으로 둔다.
  const source = SOURCES.has(str(body.source)) ? str(body.source) : '폼';

  if (body.consent !== true && body.consent !== 'true' && body.consent !== 'on') {
    errors.consent = '개인정보 수집·이용에 동의해 주세요.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    clean: { name, phone, email, company, service, message, source },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Airtable은 base당 초당 5요청 제한이 있다. 429면 지수 백오프로 재시도. */
async function airtableFetch(url, init, attempt = 0) {
  const res = await fetch(url, init);
  if (res.status === 429 && attempt < 3) {
    const wait = 300 * 2 ** attempt + Math.floor(Math.random() * 150);
    await sleep(wait);
    return airtableFetch(url, init, attempt + 1);
  }
  return res;
}

async function createAirtableRecord(clean) {
  const missing = missingEnv();
  if (missing.length) throw new Error(`환경 변수 누락: ${missing.join(', ')} (.env 확인)`);

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_LEADS_TABLE_ID;

  const fields = {
    이름: clean.name,
    연락처: clean.phone,
    유입경로: clean.source,
    상태: '신규',
  };
  if (clean.email) fields.이메일 = clean.email;
  if (clean.company) fields.회사 = clean.company;
  if (clean.service) fields.관심서비스 = clean.service;
  if (clean.message) fields.문의내용 = clean.message;

  const res = await airtableFetch(`${AIRTABLE_API}/${baseId}/${tableId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Airtable ${res.status}: ${detail.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.records?.[0]?.id;
}

/**
 * 상담 신청 1건 처리.
 * @returns {{status:number, body:object}} 클라이언트로 그대로 보낼 응답
 */
export async function handleLead(body, ip) {
  // 1) honeypot: 사람에게는 보이지 않는 필드라 비어 있다. 채워졌으면 봇 — 성공한 척하고 버린다.
  if (str(body.website)) {
    return { status: 200, body: { ok: true } };
  }

  // 2) rate limit (honeypot 트래픽이 카운터를 소모하지 않도록 그 다음에 둔다)
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return {
      status: 429,
      body: { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', retryAfter: limit.retryAfter },
    };
  }

  // 3) 서버 재검증
  const { ok, errors, clean } = validate(body);
  if (!ok) {
    return { status: 400, body: { ok: false, error: '입력값을 확인해 주세요.', errors } };
  }

  // 4) Airtable 기록
  try {
    const id = await createAirtableRecord(clean);
    // 알림은 접수를 막지 않는다: await하지 않고 실패도 삼킨다.
    notifyLead(clean, id).catch(() => {});
    return { status: 200, body: { ok: true, id } };
  } catch (err) {
    // 원인은 서버 로그에만 남긴다 (토큰·내부 정보가 응답으로 새지 않도록).
    console.error('[lead] Airtable 기록 실패:', err.message);
    return { status: 502, body: { ok: false, error: '접수 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' } };
  }
}

/** x-forwarded-for는 프록시 뒤(Vercel)에서만 신뢰한다. */
export function clientIp(headers, fallback, trustProxy) {
  if (trustProxy) {
    const xff = headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return fallback || 'unknown';
}
