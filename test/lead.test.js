// 검증·rate limit·honeypot 자체 점검. 실행: node test/lead.test.js
import assert from 'node:assert/strict';
import { validate, checkRateLimit, resetRateLimit, handleLead } from '../lib/lead.js';

const ok = { name: '홍길동', phone: '010-1234-5678', consent: true };

// --- validate ---
assert.equal(validate(ok).ok, true, '정상 입력은 통과');
assert.equal(validate({ ...ok, name: '' }).errors.name !== undefined, true, '이름 누락 거부');
assert.equal(validate({ ...ok, name: '  ' }).errors.name !== undefined, true, '공백만 있는 이름 거부');
assert.equal(validate({ ...ok, phone: '123' }).errors.phone !== undefined, true, '짧은 연락처 거부');
assert.equal(validate({ ...ok, phone: '010-abcd-5678' }).errors.phone !== undefined, true, '문자 섞인 연락처 거부');
assert.equal(validate({ ...ok, consent: false }).errors.consent !== undefined, true, '미동의 거부');
assert.equal(validate({ ...ok, email: 'nope' }).errors.email !== undefined, true, '잘못된 이메일 거부');
assert.equal(validate({ ...ok, email: '' }).ok, true, '이메일은 선택 항목');
assert.equal(validate({ ...ok, service: '없는서비스' }).errors.service !== undefined, true, '허용 목록 밖 서비스 거부');
assert.equal(validate({ ...ok, service: '업무 진단' }).ok, true, '허용된 서비스 통과');
assert.equal(validate({ ...ok, name: 'x'.repeat(101) }).errors.name !== undefined, true, '이름 길이 상한');
assert.equal(validate(ok).clean.name, '홍길동', 'clean에 trim된 값');

// --- rate limit: 1분에 3건까지 ---
resetRateLimit();
assert.equal(checkRateLimit('1.1.1.1').ok, true, '1건째 허용');
assert.equal(checkRateLimit('1.1.1.1').ok, true, '2건째 허용');
assert.equal(checkRateLimit('1.1.1.1').ok, true, '3건째 허용');
assert.equal(checkRateLimit('1.1.1.1').ok, false, '4건째 차단');
assert.equal(checkRateLimit('2.2.2.2').ok, true, '다른 IP는 영향 없음');

// 창이 지나면 다시 허용
const later = Date.now() + 61_000;
assert.equal(checkRateLimit('1.1.1.1', later).ok, true, '1분 뒤 재허용');

// --- honeypot: 채워지면 Airtable을 호출하지 않고 성공한 척 ---
resetRateLimit();
const hp = await handleLead({ ...ok, website: 'http://spam.example' }, '3.3.3.3');
assert.equal(hp.status, 200, 'honeypot은 200');
assert.equal(hp.body.ok, true, 'honeypot 응답은 성공 형태');
assert.equal(hp.body.id, undefined, 'honeypot은 레코드를 만들지 않음');
assert.equal(checkRateLimit('3.3.3.3').ok, true, 'honeypot 요청은 rate limit을 소모하지 않음');

// --- 검증 실패는 400 ---
resetRateLimit();
const bad = await handleLead({ name: '', phone: '', consent: false }, '4.4.4.4');
assert.equal(bad.status, 400, '검증 실패는 400');
assert.equal(Object.keys(bad.body.errors).length >= 3, true, '필드별 오류 반환');

// --- rate limit 초과는 429 ---
resetRateLimit();
for (let i = 0; i < 3; i++) checkRateLimit('5.5.5.5');
const limited = await handleLead(ok, '5.5.5.5');
assert.equal(limited.status, 429, '4건째는 429');
assert.equal(typeof limited.body.retryAfter, 'number', 'retryAfter 제공');

console.log('통과: lead 검증 / rate limit / honeypot');

// --- 텔레그램 알림 ---
const { notifyLead, TELEGRAM_INTERNAL } = await import('../lib/telegram.js');

// 환경 변수가 없으면 조용히 건너뛴다 (알림은 선택 기능)
const savedTg = { t: process.env.TELEGRAM_BOT_TOKEN, c: process.env.TELEGRAM_CHAT_ID };
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
const skipped = await notifyLead({ name: 'x', phone: '010-0000-0000', source: '폼' });
assert.equal(skipped.sent, false, '미설정이면 전송하지 않음');
assert.equal(skipped.reason, 'not-configured', '사유가 명확함');
if (savedTg.t) process.env.TELEGRAM_BOT_TOKEN = savedTg.t;
if (savedTg.c) process.env.TELEGRAM_CHAT_ID = savedTg.c;

// 메시지 조립: HTML 이스케이프와 길이 절단
const savedMsgIds = { b: process.env.AIRTABLE_BASE_ID, t: process.env.AIRTABLE_LEADS_TABLE_ID };
process.env.AIRTABLE_BASE_ID = 'appTEST00000000';
process.env.AIRTABLE_LEADS_TABLE_ID = 'tblTEST00000000';
const msg = TELEGRAM_INTERNAL.buildMessage({
  name: '<script>', phone: '010-1234-5678', company: 'A & B',
  source: '챗봇', message: 'x'.repeat(900),
}, 'recTEST');
assert.ok(msg.includes('&lt;script&gt;'), '이름의 HTML 이스케이프');
assert.ok(msg.includes('A &amp; B'), '앰퍼샌드 이스케이프');
assert.ok(msg.includes('유입경로: 챗봇'), '유입경로 포함');
assert.ok(msg.includes('recTEST'), '관리자 링크에 레코드 ID 포함');
assert.ok(msg.includes('…'), '긴 문의내용 절단');
assert.ok(msg.length < 1200, '텔레그램 길이 제한 안에 들어옴');
if (savedMsgIds.b) process.env.AIRTABLE_BASE_ID = savedMsgIds.b; else delete process.env.AIRTABLE_BASE_ID;
if (savedMsgIds.t) process.env.AIRTABLE_LEADS_TABLE_ID = savedMsgIds.t; else delete process.env.AIRTABLE_LEADS_TABLE_ID;

// 알림 실패가 접수를 막지 않는지: 잘못된 토큰으로도 예외가 새지 않아야 한다
process.env.TELEGRAM_BOT_TOKEN = '0:invalid';
process.env.TELEGRAM_CHAT_ID = '0';
const failed = await notifyLead({ name: 'x', phone: '010-0000-0000', source: '폼' });
assert.equal(failed.sent, false, '잘못된 토큰은 실패로 반환');
assert.ok(!('error' in failed), '예외를 던지지 않음');
if (savedTg.t) process.env.TELEGRAM_BOT_TOKEN = savedTg.t; else delete process.env.TELEGRAM_BOT_TOKEN;
if (savedTg.c) process.env.TELEGRAM_CHAT_ID = savedTg.c; else delete process.env.TELEGRAM_CHAT_ID;

// 접수 시각은 서버 시간대와 무관하게 KST로 찍힌다
const fixed = new Date('2026-09-11T00:30:00Z');   // UTC 00:30 → KST 09:30
const kst = TELEGRAM_INTERNAL.kstNow(fixed);
assert.equal(kst, '2026-09-11 09:30 KST', 'UTC를 KST로 변환');

// 관리자 링크: 식별자가 있으면 레코드 URL, 없으면 빈 문자열
const savedIds = { b: process.env.AIRTABLE_BASE_ID, t: process.env.AIRTABLE_LEADS_TABLE_ID };
process.env.AIRTABLE_BASE_ID = 'appTEST00000000';
process.env.AIRTABLE_LEADS_TABLE_ID = 'tblTEST00000000';
assert.equal(TELEGRAM_INTERNAL.adminUrl('recABC'),
  'https://airtable.com/appTEST00000000/tblTEST00000000/recABC', '레코드 링크');
delete process.env.AIRTABLE_BASE_ID;
assert.equal(TELEGRAM_INTERNAL.adminUrl('recABC'), '', '식별자 없으면 링크 생략');
if (savedIds.b) process.env.AIRTABLE_BASE_ID = savedIds.b;
if (savedIds.t) process.env.AIRTABLE_LEADS_TABLE_ID = savedIds.t;

// 메시지에 시각과 링크가 실제로 들어가는지
process.env.AIRTABLE_BASE_ID = 'appTEST00000000';
process.env.AIRTABLE_LEADS_TABLE_ID = 'tblTEST00000000';
const full = TELEGRAM_INTERNAL.buildMessage(
  { name: '홍길동', phone: '010-1234-5678', service: '업무 진단', source: '폼' }, 'recABC', fixed);
assert.ok(full.includes('접수: 2026-09-11 09:30 KST'), '메시지에 KST 시각');
assert.ok(full.includes('관리자 페이지에서 열기'), '메시지에 관리자 링크');
assert.ok(full.includes('관심 서비스: 업무 진단'), '메시지에 관심 서비스');
if (savedIds.b) process.env.AIRTABLE_BASE_ID = savedIds.b; else delete process.env.AIRTABLE_BASE_ID;
if (savedIds.t) process.env.AIRTABLE_LEADS_TABLE_ID = savedIds.t; else delete process.env.AIRTABLE_LEADS_TABLE_ID;

assert.equal(TELEGRAM_INTERNAL.TIMEOUT_MS, 5000, '타임아웃 5초');

console.log('통과: 텔레그램 알림 (미설정 건너뛰기 / 이스케이프 / 절단 / 실패 격리 / KST / 관리자 링크 / 타임아웃)');
