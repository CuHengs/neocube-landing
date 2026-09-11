// 새 상담 신청을 텔레그램으로 알린다.
// 토큰은 환경 변수에서만 읽으며, 알림 실패가 접수를 막지 않는다.

const TELEGRAM_API = 'https://api.telegram.org';
const TIMEOUT_MS = 4000;

/** HTML 파스 모드에서 깨지지 않도록 이스케이프. */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMessage(lead, recordId) {
  const lines = [
    '<b>새 상담 신청</b>',
    '',
    `이름: ${esc(lead.name)}`,
    `연락처: ${esc(lead.phone)}`,
  ];
  if (lead.email) lines.push(`이메일: ${esc(lead.email)}`);
  if (lead.company) lines.push(`회사: ${esc(lead.company)}`);
  if (lead.service) lines.push(`관심 서비스: ${esc(lead.service)}`);
  lines.push(`유입경로: ${esc(lead.source)}`);

  if (lead.message) {
    // 챗봇 경로는 대화 전문이 통째로 들어와 길다. 텔레그램 4096자 제한을 고려해 자른다.
    const body = lead.message.length > 600 ? lead.message.slice(0, 600) + '…' : lead.message;
    lines.push('', '<b>문의내용</b>', esc(body));
  }
  if (recordId) lines.push('', `Airtable: <code>${esc(recordId)}</code>`);

  return lines.join('\n');
}

/**
 * 텔레그램 알림 전송. 어떤 실패도 삼키고 예외를 던지지 않는다.
 * 환경 변수가 없으면 조용히 건너뛴다 (알림은 선택 기능).
 */
export async function notifyLead(lead, recordId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: 'not-configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildMessage(lead, recordId),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text();
      console.warn('[notify] 텔레그램 전송 실패:', res.status, detail.slice(0, 200));
      return { sent: false, reason: `http-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn('[notify] 텔레그램 전송 실패:', err.name === 'AbortError' ? '시간 초과' : err.message);
    return { sent: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

export const NOTIFY_INTERNAL = { buildMessage, esc };
