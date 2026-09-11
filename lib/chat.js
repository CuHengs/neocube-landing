// 챗봇 대화 처리. api/chat.js(Vercel)와 server.js(로컬)가 공유한다.
// LLM 키·Airtable 토큰은 이 모듈 안에서만 읽으며 응답에 담지 않는다.
import { loadKnowledge } from './knowledge.js';

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const AIRTABLE_API = 'https://api.airtable.com/v0';

const MODEL = process.env.CHAT_MODEL || 'gpt-5.6-luna';
const BOT_NAME = process.env.CHAT_BOT_NAME || '큐브';
const MAX_HISTORY = 10; // 최근 10개 메시지 = 5턴
const MAX_CHARS = 2000; // 한 메시지 길이 상한

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

// ponytail: 프로세스 메모리 rate limit. 서버리스에서는 인스턴스별로 따로 센다.
// 엄밀한 차단이 필요해지면 외부 저장소로 교체.
const hits = new Map();

export function checkChatRateLimit(ip, now = Date.now()) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
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

export function resetChatRateLimit() {
  hits.clear();
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** 클라이언트가 보낸 대화 이력을 신뢰하지 않고 정리한다. */
export function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && str(m.content))
    .map((m) => ({ role: m.role, content: str(m.content).slice(0, MAX_CHARS) }))
    .slice(-MAX_HISTORY);
}

export function buildSystemPrompt(knowledge) {
  const hasKnowledge = knowledge.text.length > 0;
  return `당신은 네오큐브(NEOCUBE)의 고객 응대 챗봇 '${BOT_NAME}'입니다.
네오큐브는 IT 서비스업 중소기업의 내부 업무를 진단하고 재설계하고 실행까지 대행하는 컨설팅 회사입니다.

## 답변 규칙

1. 인사나 자기소개 요청에는 이름(${BOT_NAME})과 역할(네오큐브 서비스·비용·절차 안내)을 짧게 밝히고 무엇을 도와드릴지 물어봅니다.
2. 서비스·정책·비용·절차 질문은 아래 [참고 문서]에 있는 내용만 근거로 답합니다. 문서에 없는 금액, 기간, 조건을 지어내지 마십시오.
3. 문서에서 근거를 찾지 못하면 추측하지 말고 이렇게 답합니다: "문서에서 확인되지 않는 내용입니다. 담당자 상담을 연결해 드릴까요?"
4. 날씨·잡담 등 네오큐브와 무관한 질문에는 정중히 사양하고 서비스 관련 질문으로 유도합니다.
5. 법률·세무 판단(계약의 법적 효력, 세금 처리 방식 등)은 하지 않습니다. "해당 사안은 전문가 확인이 필요합니다"라고 안내한 뒤 문서에 적힌 사실만 참고로 전달합니다.
6. 한국어 존댓말로 3~5문장 이내로 간결하게 답합니다. 마크다운 표나 제목은 쓰지 마십시오.
7. 사용자가 연락처를 남기겠다거나 상담을 신청하고 싶다는 뜻을 밝히면 wantsLead를 true로 설정합니다.

## 출력 형식

반드시 아래 키를 가진 JSON 객체 하나만 출력합니다.
{"reply": "사용자에게 보여줄 답변", "usedFaq": "근거로 삼은 참고 문서 항목의 질문 문장 그대로. 근거가 없으면 빈 문자열", "wantsLead": false}

## 참고 문서

${hasKnowledge ? knowledge.text : '(참고 문서를 불러오지 못했습니다. 구체적인 금액·기간·조건은 답하지 말고 담당자 상담 연결을 안내하십시오.)'}`;
}

function safeParseReply(content) {
  try {
    const parsed = JSON.parse(content);
    return {
      reply: str(parsed.reply),
      usedFaq: str(parsed.usedFaq),
      wantsLead: parsed.wantsLead === true,
    };
  } catch {
    // JSON이 아니어도 본문을 그대로 답변으로 쓴다 — 답변을 멈추지 않는다.
    return { reply: str(content), usedFaq: '', wantsLead: false };
  }
}

async function callModel(messages) {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error('LLM_API_KEY 환경 변수가 설정되지 않았습니다.');

  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/** ChatLogs 기록. 실패해도 예외를 던지지 않는다 — 기록이 답변을 막으면 안 된다. */
export async function logChat(sessionId, rows) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_CHATLOGS_TABLE_ID;
  if (!token || !baseId || !tableId || !sessionId) return;

  const records = rows.map((r) => {
    const fields = { 세션ID: sessionId, 역할: r.role, 내용: r.content };
    if (r.usedFaq) fields.참고한FAQ = r.usedFaq;
    return { fields };
  });

  try {
    const res = await fetch(`${AIRTABLE_API}/${baseId}/${tableId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, typecast: false }),
    });
    if (!res.ok) {
      console.warn('[chat] ChatLogs 기록 실패:', res.status, (await res.text()).slice(0, 200));
    }
  } catch (err) {
    console.warn('[chat] ChatLogs 기록 실패:', err.message);
  }
}

/**
 * 대화 1턴 처리.
 * @returns {{status:number, body:object}} 클라이언트로 그대로 보낼 응답
 */
export async function handleChat(body, ip) {
  const limit = checkChatRateLimit(ip);
  if (!limit.ok) {
    return {
      status: 429,
      body: { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', retryAfter: limit.retryAfter },
    };
  }

  const sessionId = str(body.sessionId).slice(0, 100);
  const history = normalizeMessages(body.messages);
  const last = history[history.length - 1];
  if (!last || last.role !== 'user') {
    return { status: 400, body: { ok: false, error: '보낼 메시지가 없습니다.' } };
  }

  // 지식은 실패해도 폴백까지 처리되어 항상 값이 돌아온다.
  const knowledge = await loadKnowledge();

  let result;
  try {
    const content = await callModel([
      { role: 'system', content: buildSystemPrompt(knowledge) },
      ...history,
    ]);
    result = safeParseReply(content);
  } catch (err) {
    console.error('[chat] 모델 호출 실패:', err.message);
    return {
      status: 502,
      body: { ok: false, error: '지금은 답변을 드리기 어렵습니다. 잠시 후 다시 시도하시거나 상담 신청을 이용해 주세요.' },
    };
  }

  if (!result.reply) {
    result.reply = '죄송합니다. 답변을 만들지 못했습니다. 담당자 상담을 연결해 드릴까요?';
  }

  // await하지 않으면 Vercel이 응답 직후 함수를 얼려 기록 요청이 끊긴다.
  // logChat은 실패를 삼키므로, 기다려도 답변이 막히지 않는다.
  await logChat(sessionId, [
    { role: 'user', content: last.content },
    { role: 'assistant', content: result.reply, usedFaq: result.usedFaq },
  ]).catch(() => {});

  return {
    status: 200,
    body: {
      ok: true,
      reply: result.reply,
      wantsLead: result.wantsLead,
      usedFaq: result.usedFaq,
      knowledgeSource: knowledge.source,
    },
  };
}

export const CHAT_LIMITS = { MAX_HISTORY, MAX_CHARS, MODEL, BOT_NAME };
