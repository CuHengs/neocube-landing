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
const { notifyLead, NOTIFY_INTERNAL } = await import('../lib/notify.js');

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
const msg = NOTIFY_INTERNAL.buildMessage({
  name: '<script>', phone: '010-1234-5678', company: 'A & B',
  source: '챗봇', message: 'x'.repeat(900),
}, 'recTEST');
assert.ok(msg.includes('&lt;script&gt;'), '이름의 HTML 이스케이프');
assert.ok(msg.includes('A &amp; B'), '앰퍼샌드 이스케이프');
assert.ok(msg.includes('유입경로: 챗봇'), '유입경로 포함');
assert.ok(msg.includes('recTEST'), 'Airtable 레코드 ID 포함');
assert.ok(msg.includes('…'), '긴 문의내용 절단');
assert.ok(msg.length < 1200, '텔레그램 길이 제한 안에 들어옴');

// 알림 실패가 접수를 막지 않는지: 잘못된 토큰으로도 예외가 새지 않아야 한다
process.env.TELEGRAM_BOT_TOKEN = '0:invalid';
process.env.TELEGRAM_CHAT_ID = '0';
const failed = await notifyLead({ name: 'x', phone: '010-0000-0000', source: '폼' });
assert.equal(failed.sent, false, '잘못된 토큰은 실패로 반환');
assert.ok(!('error' in failed), '예외를 던지지 않음');
if (savedTg.t) process.env.TELEGRAM_BOT_TOKEN = savedTg.t; else delete process.env.TELEGRAM_BOT_TOKEN;
if (savedTg.c) process.env.TELEGRAM_CHAT_ID = savedTg.c; else delete process.env.TELEGRAM_CHAT_ID;

console.log('통과: 텔레그램 알림 (미설정 건너뛰기 / 이스케이프 / 절단 / 실패 격리)');
