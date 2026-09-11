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
