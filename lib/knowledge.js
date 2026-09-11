// 챗봇 지식 소스. Airtable FAQ 표를 읽어 시스템 프롬프트에 넣을 텍스트로 만든다.
// Airtable이 없거나 실패하면 docs/faq.md를 그대로 쓴다 — 챗봇은 어떤 경우에도 답변을 멈추지 않는다.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const AIRTABLE_API = 'https://api.airtable.com/v0';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const MAX_FAQ = 60; // 우선순위 높은 순으로 이만큼만 주입
const FALLBACK_PATH = fileURLToPath(new URL('../docs/faq.md', import.meta.url));

let cache = { text: null, source: null, count: 0, questions: [], at: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Airtable 429(초당 5요청)는 지수 백오프로 재시도. */
async function airtableFetch(url, init, attempt = 0) {
  const res = await fetch(url, init);
  if (res.status === 429 && attempt < 3) {
    await sleep(300 * 2 ** attempt + Math.floor(Math.random() * 150));
    return airtableFetch(url, init, attempt + 1);
  }
  return res;
}

/** 공개 체크된 FAQ를 우선순위 오름차순(1이 가장 높음)으로 최대 MAX_FAQ건. */
async function fetchFromAirtable() {
  // 읽기 전용 토큰이 있으면 그쪽을 쓴다 (최소 권한). 없으면 쓰기 토큰으로 대체.
  const token = process.env.AIRTABLE_READ_TOKEN || process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_FAQ_TABLE_ID;
  if (!token || !baseId || !tableId) throw new Error('Airtable 환경 변수 미설정');

  const params = new URLSearchParams({
    pageSize: String(MAX_FAQ),
    filterByFormula: '{공개} = TRUE()',
  });
  params.append('sort[0][field]', '우선순위');
  params.append('sort[0][direction]', 'asc');
  for (const f of ['질문', '답변', '분류', '유의어', '우선순위']) params.append('fields[]', f);

  const res = await airtableFetch(`${AIRTABLE_API}/${baseId}/${tableId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const { records = [] } = await res.json();
  const items = records
    .map((r) => ({
      질문: r.fields['질문'] || '',
      답변: r.fields['답변'] || '',
      분류: r.fields['분류'] || '',
      유의어: r.fields['유의어'] || '',
    }))
    .filter((r) => r.질문 && r.답변);

  if (items.length === 0) throw new Error('공개된 FAQ가 0건');
  return items;
}

function formatFaq(items) {
  return items
    .map((r, i) => {
      const lines = [`### [${i + 1}] ${r.질문}`];
      if (r.분류) lines.push(`분류: ${r.분류}`);
      if (r.유의어) lines.push(`유의어: ${r.유의어}`);
      lines.push(`답변: ${r.답변}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * 시스템 프롬프트에 넣을 지식 텍스트. 5분간 캐시한다.
 * @param {boolean} force 캐시를 무시하고 다시 읽을지
 * @returns {Promise<{text:string, source:'airtable'|'file'|'none', count:number, questions:string[]}>}
 */
export async function loadKnowledge(force = false) {
  const now = Date.now();
  if (!force && cache.text !== null && now - cache.at < CACHE_TTL_MS) {
    const { at, ...rest } = cache;
    return rest;
  }

  try {
    const items = await fetchFromAirtable();
    cache = {
      text: formatFaq(items),
      source: 'airtable',
      count: items.length,
      questions: items.map((r) => r.질문),
      at: now,
    };
  } catch (err) {
    console.warn('[knowledge] Airtable 조회 실패, docs/faq.md로 폴백:', err.message);
    try {
      const text = (await readFile(FALLBACK_PATH, 'utf8')).trim();
      cache = { text, source: 'file', count: 1, questions: [], at: now };
    } catch (err2) {
      // 지식이 전혀 없어도 챗봇은 계속 답한다 (근거 없음을 밝히고 상담 연결을 안내하게 된다).
      console.error('[knowledge] 폴백 파일도 읽지 못함:', err2.message);
      cache = { text: '', source: 'none', count: 0, questions: [], at: now };
    }
  }

  const { at, ...rest } = cache;
  return rest;
}

/** 테스트·운영용: 다음 요청에서 강제로 다시 읽게 한다. */
export function clearKnowledgeCache() {
  cache = { text: null, source: null, count: 0, questions: [], at: 0 };
}

export const KNOWLEDGE_LIMITS = { CACHE_TTL_MS, MAX_FAQ, FALLBACK_PATH };
