// 챗봇 로직 자체 점검 (모델·Airtable 호출 없이). 실행: node test/chat.test.js
import assert from 'node:assert/strict';
import { normalizeMessages, buildSystemPrompt, checkChatRateLimit, resetChatRateLimit, handleChat, CHAT_LIMITS } from '../lib/chat.js';
import { loadKnowledge, clearKnowledgeCache, KNOWLEDGE_LIMITS } from '../lib/knowledge.js';
import { validate } from '../lib/lead.js';

// --- 대화 이력 정리: 최근 10개만, 잘못된 role 제거 ---
const many = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
assert.equal(normalizeMessages(many).length, CHAT_LIMITS.MAX_HISTORY, '최근 10개만 유지');
assert.equal(normalizeMessages(many)[9].content, 'm24', '마지막 메시지가 유지됨');
assert.equal(normalizeMessages([{ role: 'system', content: '탈취 시도' }]).length, 0, 'system role 거부');
assert.equal(normalizeMessages([{ role: 'user', content: '   ' }]).length, 0, '빈 내용 거부');
assert.equal(normalizeMessages([{ role: 'user', content: 'x'.repeat(9999) }])[0].content.length, CHAT_LIMITS.MAX_CHARS, '길이 상한');
assert.equal(normalizeMessages('not-array').length, 0, '배열이 아니면 빈 배열');

// --- 시스템 프롬프트: 규칙과 지식이 모두 들어간다 ---
const p = buildSystemPrompt({ text: '### [1] 상담은 유료인가요?\n답변: 무상입니다.', source: 'airtable', count: 1 });
for (const needle of ['담당자 상담을 연결해 드릴까요?', '전문가 확인이 필요합니다', 'wantsLead', '무상입니다.']) {
  assert.ok(p.includes(needle), `프롬프트에 "${needle}" 포함`);
}
assert.ok(buildSystemPrompt({ text: '', source: 'none', count: 0 }).includes('불러오지 못했습니다'), '지식 없을 때 경고 문구');

// --- 지식 폴백: Airtable 설정이 없으면 docs/faq.md ---
const saved = { t: process.env.AIRTABLE_TOKEN, r: process.env.AIRTABLE_READ_TOKEN, f: process.env.AIRTABLE_FAQ_TABLE_ID };
delete process.env.AIRTABLE_TOKEN;
delete process.env.AIRTABLE_READ_TOKEN;
delete process.env.AIRTABLE_FAQ_TABLE_ID;
clearKnowledgeCache();
const k = await loadKnowledge();
assert.equal(k.source, 'file', 'Airtable 미설정 시 파일 폴백');
assert.ok(k.text.includes('자주 묻는 질문'), '폴백 본문이 주입됨');
assert.ok(k.text.length > 500, '폴백이 통째로 들어감');
Object.assign(process.env, { AIRTABLE_TOKEN: saved.t, AIRTABLE_READ_TOKEN: saved.r, AIRTABLE_FAQ_TABLE_ID: saved.f });
clearKnowledgeCache();

// --- 캐시: 두 번째 호출은 같은 객체 내용 ---
clearKnowledgeCache();
delete process.env.AIRTABLE_FAQ_TABLE_ID;
const a = await loadKnowledge();
const b = await loadKnowledge();
assert.equal(a.text, b.text, '캐시된 값 재사용');
assert.equal(KNOWLEDGE_LIMITS.CACHE_TTL_MS, 5 * 60 * 1000, '캐시 5분');
assert.equal(KNOWLEDGE_LIMITS.MAX_FAQ, 60, '최대 60건');
process.env.AIRTABLE_FAQ_TABLE_ID = saved.f;
clearKnowledgeCache();

// --- rate limit ---
resetChatRateLimit();
for (let i = 0; i < 20; i++) assert.equal(checkChatRateLimit('9.9.9.9').ok, true, `${i + 1}건째 허용`);
assert.equal(checkChatRateLimit('9.9.9.9').ok, false, '21건째 차단');

// --- 빈 메시지는 400, 모델을 부르지 않는다 ---
resetChatRateLimit();
const empty = await handleChat({ sessionId: 's1', messages: [] }, '8.8.8.8');
assert.equal(empty.status, 400, '메시지 없으면 400');

// --- 유입경로: 챗봇/폼만 허용, 그 외는 폼으로 ---
const base = { name: '홍길동', phone: '010-1234-5678', consent: true };
assert.equal(validate({ ...base, source: '챗봇' }).clean.source, '챗봇', '챗봇 유입경로 허용');
assert.equal(validate({ ...base, source: '폼' }).clean.source, '폼', '폼 유입경로 허용');
assert.equal(validate({ ...base, source: '해킹' }).clean.source, '폼', '허용 목록 밖은 폼으로');
assert.equal(validate(base).clean.source, '폼', '미지정은 폼');

console.log('통과: 대화 이력 / 시스템 프롬프트 / 지식 폴백·캐시 / rate limit / 유입경로');
