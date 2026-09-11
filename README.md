# 네오큐브 (NEOCUBE) 랜딩 페이지

IT 서비스업 중소기업 대상 컨설팅 회사의 회사 소개 랜딩 페이지.
상담 신청 폼과 FAQ 기반 고객 응대 챗봇이 붙어 있고, 접수된 문의는 Airtable CRM에 기록된다.

## 구성

```
index.html            랜딩 페이지 + 상담 신청 모달
chatbot.js            우측 하단 챗봇 위젯 (순수 JS, 의존성 없음)
server.js             로컬 개발 서버 (정적 서빙 + /api/*)

api/lead.js           POST /api/lead   상담 신청 접수
api/chat.js           POST /api/chat   챗봇 대화

lib/lead.js           검증 · honeypot · rate limit · Airtable 기록
lib/chat.js           시스템 프롬프트 · 모델 호출 · 대화 로그
lib/knowledge.js      FAQ 조회 · 5분 캐시 · docs/faq.md 폴백
lib/notify.js         새 상담 신청 텔레그램 알림 (선택)

docs/faq.md           Airtable 조회 실패 시 쓰는 폴백 지식
helloinsa-ds/         디자인 토큰 (CSS 변수)
test/                 검증 로직 자체 점검
```

## 실행

```bash
cp .env.example .env   # 값을 채운 뒤
node server.js         # http://localhost:3000
```

Node 20.12 이상이 필요하다 (`process.loadEnvFile`, 내장 `fetch`).

## 테스트

```bash
node test/lead.test.js
node test/chat.test.js
```

모델과 Airtable을 호출하지 않고 검증 로직만 확인한다.

## 환경 변수

모두 서버에서만 읽으며 클라이언트 번들에 포함되지 않는다. `.env.example` 참고.

| 키 | 용도 |
|---|---|
| `AIRTABLE_TOKEN` | Leads · ChatLogs 기록 (쓰기) |
| `AIRTABLE_READ_TOKEN` | FAQ 조회 (선택, 없으면 위 토큰 사용) |
| `AIRTABLE_BASE_ID` | 대상 베이스 |
| `AIRTABLE_LEADS_TABLE_ID` | 상담 신청 표 |
| `AIRTABLE_FAQ_TABLE_ID` | 챗봇 지식 표 |
| `AIRTABLE_CHATLOGS_TABLE_ID` | 대화 기록 표 |
| `LLM_API_KEY` | OpenAI API 키 |
| `CHAT_MODEL` | 답변 모델 |
| `CHAT_BOT_NAME` | 챗봇 표시 이름 |
| `TELEGRAM_BOT_TOKEN` | 새 상담 신청 알림 (선택) |
| `TELEGRAM_CHAT_ID` | 알림 받을 채팅 (선택) |

## 배포 (Vercel)

정적 파일은 CDN이, `/api/*`는 서버리스 함수가 처리한다.
Settings → Environment Variables에 위 값을 모두 등록해야 한다.

`vercel.json`에서 `api/chat.js`에 `includeFiles: "docs/**"`를 지정한다 —
FAQ 폴백 파일이 함수 번들에 포함되어야 하기 때문이다.

## 동작 메모

- **상담 신청** — 서버에서 이름·연락처를 다시 검증하고, honeypot 필드가 채워지면 조용히 버린다. 같은 IP 1분 3건 초과는 429.
- **챗봇** — 공개 체크된 FAQ를 우선순위 순 60건까지 시스템 프롬프트에 넣는다. Airtable이 실패하면 `docs/faq.md`로 폴백해 답변을 멈추지 않는다.
- **텔레그램 알림** — 상담 접수 성공 직후 보낸다. `await`하지 않고 실패도 삼키므로 알림이 접수를 막지 않는다. 환경 변수가 없으면 조용히 건너뛴다.
- **대화 기록** — ChatLogs 기록은 `await`하지 않고 실패도 삼킨다. 기록이 답변을 막지 않는다.
- **rate limit** — 프로세스 메모리 기반이라 서버리스에서는 인스턴스마다 따로 센다. 엄밀한 차단이 필요하면 외부 저장소로 교체해야 한다.

## 저장소에 없는 것

디자인 캔버스 산출물(`*.dc.html`, `support.js`, `_ds/`)은 앱이 생성하는 파일이라 제외했다.
