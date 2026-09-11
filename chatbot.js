/* 네오큐브 고객 응대 챗봇 위젯 — 순수 JS, 의존성 없음.
   index.html에서 <script src="chatbot.js" defer></script> 로 불러온다.
   색상·폰트는 helloinsa-ds/tokens.css의 CSS 변수를 쓰고, 없을 때를 대비해 폴백 값을 둔다. */
(function () {
  'use strict';

  var MAX_HISTORY = 10;   // 최근 10개 메시지 = 5턴 (서버와 동일)
  var WELCOME_DELAY = 1000;
  var BOT_NAME = '큐브';

  var WELCOME =
    '안녕하세요, 네오큐브 상담 챗봇 ' + BOT_NAME + '입니다. ' +
    '서비스 구성, 비용, 진행 절차를 안내해 드립니다. 무엇이 궁금하신가요?';

  /* ---------- 상태 ---------- */
  var messages = [];      // {role, content} — 서버로 보내는 이력
  var sessionId = getSessionId();
  var isOpen = false;
  var isSending = false;
  var welcomed = false;
  var leadFormOpen = false;
  var isComposing = false;   // IME(한글 등) 조합 중인지

  function getSessionId() {
    try {
      var v = sessionStorage.getItem('neocube-chat-session');
      if (v) return v;
      v = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      sessionStorage.setItem('neocube-chat-session', v);
      return v;
    } catch (e) {
      return 'sess-' + Date.now(); // 프라이빗 모드 등 sessionStorage 불가
    }
  }

  /* ---------- 스타일 ---------- */
  var CSS = [
    '.nc-chat-launcher{position:fixed;right:24px;bottom:24px;z-index:9998;display:flex;align-items:center;justify-content:center;',
    'width:56px;height:56px;border:none;border-radius:9999px;cursor:pointer;',
    'background:var(--hi-blue-600,#1B4DE4);color:#fff;box-shadow:0 8px 24px rgba(8,24,47,.24);',
    'transition:transform .14s cubic-bezier(.4,0,.2,1),background .14s cubic-bezier(.4,0,.2,1);}',
    '.nc-chat-launcher:hover{background:var(--hi-blue-500,#3C68EA);transform:translateY(-2px);}',
    '.nc-chat-launcher svg{width:26px;height:26px;display:block;}',
    '.nc-chat-launcher__dot{position:absolute;top:10px;right:10px;width:10px;height:10px;border-radius:9999px;',
    'background:var(--hi-danger,#D83A2B);border:2px solid var(--hi-blue-600,#1B4DE4);}',

    '.nc-chat-panel{position:fixed;right:24px;bottom:92px;z-index:9999;display:flex;flex-direction:column;',
    'width:380px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 130px);',
    'background:var(--hi-surface,#fff);border:1px solid var(--hi-line,#E4E7EC);border-radius:var(--hi-r-xl,24px);',
    'box-shadow:0 18px 48px rgba(8,24,47,.18);overflow:hidden;',
    'font-family:var(--hi-font,-apple-system,BlinkMacSystemFont,system-ui,sans-serif);color:var(--hi-ink,#14181F);',
    'opacity:0;transform:translateY(16px) scale(.98);pointer-events:none;',
    'transition:opacity .18s cubic-bezier(.4,0,.2,1),transform .18s cubic-bezier(.4,0,.2,1);}',
    '.nc-chat-panel.is-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}',

    '.nc-chat-head{flex:none;display:flex;align-items:center;gap:10px;padding:18px 20px;',
    'background:var(--hi-navy-900,#08182F);color:#fff;}',
    '.nc-chat-head__avatar{flex:none;width:34px;height:34px;border-radius:9999px;background:var(--hi-blue-600,#1B4DE4);',
    'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;}',
    '.nc-chat-head__name{font-size:15px;font-weight:700;letter-spacing:-.01em;}',
    '.nc-chat-head__desc{margin-top:2px;font-size:12px;color:rgba(255,255,255,.62);font-weight:500;}',
    '.nc-chat-head__close{margin-left:auto;width:30px;height:30px;border:none;border-radius:8px;cursor:pointer;',
    'background:rgba(255,255,255,.12);color:#fff;font-size:15px;line-height:1;}',
    '.nc-chat-head__close:hover{background:rgba(255,255,255,.22);}',

    '.nc-chat-log{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;',
    'background:var(--hi-surface-2,#F7F8FA);}',
    '.nc-msg{max-width:84%;padding:11px 14px;font-size:14px;line-height:1.7;font-weight:500;word-break:keep-all;overflow-wrap:break-word;}',
    '.nc-msg--user,.nc-msg--error{white-space:pre-wrap;}',
    '.nc-msg--bot p{margin:0;}',
    '.nc-msg--bot p+p,.nc-msg--bot p+ul,.nc-msg--bot ul+p,.nc-msg--bot .nc-table+p,.nc-msg--bot p+.nc-table{margin-top:8px;}',
    '.nc-msg--bot ul{margin:0;padding-left:18px;}',
    '.nc-msg--bot li{margin:2px 0;}',
    '.nc-msg--bot strong{font-weight:700;}',
    '.nc-msg--bot code{padding:1px 5px;border-radius:4px;background:var(--hi-surface-2,#FAFAFA);',
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;}',
    /* 표가 들어가면 말풍선을 넘게 펼친다 */
    '.nc-msg--wide{max-width:100%;align-self:stretch;}',
    /* 표는 말풍선 패딩 바깥까지 써서 폭을 번다. 그래도 좁으면 가로 스크롤 */
    '.nc-table{overflow-x:auto;margin:8px -14px 0;padding:0 14px;-webkit-overflow-scrolling:touch;}',
    '.nc-msg--bot table{border-collapse:collapse;font-size:12.5px;line-height:1.5;min-width:100%;}',
    '.nc-msg--bot th,.nc-msg--bot td{border:1px solid var(--hi-line,#EEE);padding:6px 8px;text-align:left;',
    'white-space:nowrap;}',
    '.nc-msg--bot th{background:var(--hi-surface-2,#FAFAFA);font-weight:700;}',
    '.nc-msg--bot td:not(:first-child),.nc-msg--bot th:not(:first-child){text-align:right;}',
    '.nc-msg--bot{align-self:flex-start;background:var(--hi-surface,#fff);border:1px solid var(--hi-line,#E4E7EC);',
    'border-radius:14px 14px 14px 4px;}',
    '.nc-msg--user{align-self:flex-end;background:var(--hi-blue-600,#1B4DE4);color:#fff;border-radius:14px 14px 4px 14px;}',
    '.nc-msg--error{align-self:flex-start;background:#FDECEA;border:1px solid #F5C6C0;color:var(--hi-danger,#D83A2B);',
    'border-radius:14px;font-size:13px;}',

    '.nc-typing{align-self:flex-start;display:flex;gap:4px;padding:14px;background:var(--hi-surface,#fff);',
    'border:1px solid var(--hi-line,#E4E7EC);border-radius:14px 14px 14px 4px;}',
    '.nc-typing span{width:7px;height:7px;border-radius:9999px;background:var(--hi-ink-4,#9AA1AC);',
    'animation:nc-bounce 1.2s infinite ease-in-out;}',
    '.nc-typing span:nth-child(2){animation-delay:.15s;}',
    '.nc-typing span:nth-child(3){animation-delay:.3s;}',
    '@keyframes nc-bounce{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-5px);opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.nc-typing span{animation:none}.nc-chat-panel{transition:none}}',

    '.nc-lead{align-self:stretch;background:var(--hi-surface,#fff);border:1px solid var(--hi-line,#E4E7EC);',
    'border-radius:14px;padding:16px;}',
    '.nc-lead__title{font-size:14px;font-weight:700;margin-bottom:4px;}',
    '.nc-lead__desc{font-size:12px;line-height:1.6;color:var(--hi-ink-3,#6B7280);font-weight:500;margin-bottom:12px;}',
    '.nc-lead input[type=text],.nc-lead input[type=tel]{width:100%;padding:10px 12px;margin-bottom:8px;',
    'font:500 14px/1.5 inherit;color:var(--hi-ink,#14181F);background:var(--hi-surface,#fff);',
    'border:1px solid var(--hi-line,#E4E7EC);border-radius:8px;outline:none;}',
    '.nc-lead input:focus{border-color:var(--hi-blue-600,#1B4DE4);box-shadow:0 0 0 3px var(--hi-blue-50,#EEF3FE);}',
    '.nc-lead__consent{display:flex;gap:8px;align-items:flex-start;margin:10px 0 12px;}',
    '.nc-lead__consent input{margin:2px 0 0;width:16px;height:16px;flex:none;accent-color:var(--hi-blue-600,#1B4DE4);}',
    '.nc-lead__consent label{font-size:12px;line-height:1.6;color:var(--hi-ink-2,#414852);font-weight:500;}',
    '.nc-lead__actions{display:flex;gap:8px;}',
    '.nc-lead__err{margin:8px 0 0;font-size:12px;color:var(--hi-danger,#D83A2B);font-weight:500;}',

    '.nc-btn{display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;',
    'font:600 13px/1.2 inherit;border-radius:8px;border:1px solid transparent;cursor:pointer;',
    'background:var(--hi-blue-600,#1B4DE4);color:#fff;}',
    '.nc-btn:hover{background:var(--hi-blue-500,#3C68EA);}',
    '.nc-btn:disabled{opacity:.55;cursor:not-allowed;}',
    '.nc-btn--ghost{background:transparent;color:var(--hi-ink-2,#414852);border-color:var(--hi-line,#E4E7EC);}',
    '.nc-btn--ghost:hover{background:var(--hi-surface-2,#F7F8FA);}',

    '.nc-chat-foot{flex:none;display:flex;gap:8px;padding:14px;border-top:1px solid var(--hi-line-soft,#EFF1F4);',
    'background:var(--hi-surface,#fff);}',
    '.nc-chat-foot textarea{flex:1;resize:none;height:42px;max-height:110px;padding:11px 12px;',
    'font:500 14px/1.4 inherit;color:var(--hi-ink,#14181F);background:var(--hi-surface,#fff);',
    'border:1px solid var(--hi-line,#E4E7EC);border-radius:10px;outline:none;}',
    '.nc-chat-foot textarea:focus{border-color:var(--hi-blue-600,#1B4DE4);box-shadow:0 0 0 3px var(--hi-blue-50,#EEF3FE);}',
    '.nc-chat-foot .nc-btn{height:42px;flex:none;}',

    '@media (max-width:520px){',
    '.nc-chat-launcher{right:16px;bottom:16px;width:52px;height:52px;}',
    '.nc-chat-panel{right:8px;left:8px;bottom:80px;width:auto;max-width:none;height:calc(100vh - 100px);}',
    '}'
  ].join('');

  /* ---------- DOM ---------- */
  var launcher, panel, log, input, sendBtn, dot;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    var style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    launcher = el('button', 'nc-chat-launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', '상담 챗봇 열기');
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    dot = el('span', 'nc-chat-launcher__dot');
    dot.hidden = true;
    launcher.appendChild(dot);

    panel = el('div', 'nc-chat-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '네오큐브 상담 챗봇');

    var head = el('div', 'nc-chat-head');
    head.appendChild(el('div', 'nc-chat-head__avatar', BOT_NAME.charAt(0)));
    var headText = el('div');
    headText.appendChild(el('div', 'nc-chat-head__name', '네오큐브 상담 챗봇 ' + BOT_NAME));
    headText.appendChild(el('div', 'nc-chat-head__desc', '서비스 · 비용 · 진행 절차 안내'));
    head.appendChild(headText);
    var closeBtn = el('button', 'nc-chat-head__close', '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.addEventListener('click', close);
    head.appendChild(closeBtn);

    log = el('div', 'nc-chat-log');
    log.setAttribute('aria-live', 'polite');

    var foot = el('form', 'nc-chat-foot');
    input = el('textarea');
    input.placeholder = '궁금한 점을 입력해 주세요';
    input.rows = 1;
    input.setAttribute('aria-label', '메시지 입력');
    sendBtn = el('button', 'nc-btn', '전송');
    sendBtn.type = 'submit';
    foot.appendChild(input);
    foot.appendChild(sendBtn);
    foot.addEventListener('submit', function (e) {
      e.preventDefault();
      send(input.value);
    });

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(foot);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    launcher.addEventListener('click', function () { isOpen ? close() : open(); });

    // 한글·일본어 등 IME 조합 중에는 Enter가 "조합 확정"이라 전송하면 안 된다.
    // 확정 전에 input.value를 비우면 마지막 글자가 뒤늦게 커밋돼 입력창에 남는다.
    input.addEventListener('compositionstart', function () { isComposing = true; });
    input.addEventListener('compositionend', function () { isComposing = false; });

    // Enter 전송, Shift+Enter 줄바꿈
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      // e.isComposing은 최신 브라우저, keyCode 229는 구형 IME 폴백.
      if (isComposing || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      send(input.value);
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });
  }

  /* ---------- 렌더 ---------- */
  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- 마크다운 (허용 부분집합) ----------
     모델 출력을 innerHTML에 그대로 넣으면 HTML이 실행된다.
     먼저 전부 이스케이프한 뒤, 우리가 만드는 태그만 다시 넣는다. */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  var RE_ROW = /^\s*\|.*\|\s*$/;
  var RE_SEP = /^\s*\|[\s:|-]+\|\s*$/;

  function splitRow(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map(function (c) {
      return inline(c.trim());
    });
  }

  function mdToHtml(src) {
    var lines = esc(src).split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // 표: 헤더 행 바로 뒤에 구분 행이 올 때만 인정한다
      if (RE_ROW.test(line) && i + 1 < lines.length && RE_SEP.test(lines[i + 1])) {
        var head = splitRow(line);
        i += 2;
        var body = [];
        while (i < lines.length && RE_ROW.test(lines[i])) {
          body.push(splitRow(lines[i]));
          i++;
        }
        var html = '<div class="nc-table"><table><thead><tr>';
        head.forEach(function (c) { html += '<th>' + c + '</th>'; });
        html += '</tr></thead><tbody>';
        body.forEach(function (row) {
          html += '<tr>';
          // 칸 수가 헤더와 달라도 깨지지 않게 헤더 길이에 맞춘다
          for (var c = 0; c < head.length; c++) html += '<td>' + (row[c] || '') + '</td>';
          html += '</tr>';
        });
        out.push(html + '</tbody></table></div>');
        continue;
      }

      // 목록
      if (/^\s*[-*]\s+/.test(line)) {
        var items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>');
          i++;
        }
        out.push('<ul>' + items.join('') + '</ul>');
        continue;
      }

      // 문단: 빈 줄이나 다른 블록이 나올 때까지 모아 <br>로 잇는다
      if (line.trim() === '') { i++; continue; }
      var para = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             !RE_ROW.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) {
        para.push(inline(lines[i].trim()));
        i++;
      }
      out.push('<p>' + para.join('<br>') + '</p>');
    }

    return out.join('');
  }

  function addBubble(role, text) {
    var cls = role === 'user' ? 'nc-msg nc-msg--user'
      : role === 'error' ? 'nc-msg nc-msg--error'
      : 'nc-msg nc-msg--bot';
    var node = el('div', cls);

    if (role === 'bot') {
      node.innerHTML = mdToHtml(text);
      // 표가 들어가면 말풍선 폭을 넓힌다
      if (node.querySelector('table')) node.classList.add('nc-msg--wide');
    } else {
      node.textContent = text; // 사용자·오류 문구는 항상 평문
    }

    log.appendChild(node);
    scrollDown();
    return node;
  }

  function showTyping() {
    var t = el('div', 'nc-typing', '<span></span><span></span><span></span>');
    log.appendChild(t);
    scrollDown();
    return t;
  }

  function remember(role, content) {
    messages.push({ role: role, content: content });
    if (messages.length > MAX_HISTORY) messages = messages.slice(-MAX_HISTORY);
  }

  function open() {
    isOpen = true;
    panel.classList.add('is-open');
    launcher.setAttribute('aria-label', '상담 챗봇 닫기');
    dot.hidden = true;
    showWelcome();
    setTimeout(function () { input.focus(); }, 180);
    scrollDown();
  }

  function close() {
    isOpen = false;
    panel.classList.remove('is-open');
    launcher.setAttribute('aria-label', '상담 챗봇 열기');
    launcher.focus();
  }

  function showWelcome() {
    if (welcomed) return;
    welcomed = true;
    addBubble('bot', WELCOME);
    remember('assistant', WELCOME);
  }

  /* ---------- 전송 ---------- */
  function send(raw) {
    var text = (raw || '').trim();
    if (!text || isSending) return;

    showWelcome();
    input.value = '';
    input.style.height = 'auto';

    addBubble('user', text);
    remember('user', text);

    isSending = true;
    sendBtn.disabled = true;
    var typing = showTyping();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, messages: messages })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        typing.remove();
        if (r.status === 200 && r.body.ok && r.body.reply) {
          addBubble('bot', r.body.reply);
          remember('assistant', r.body.reply);
          if (r.body.wantsLead) showLeadForm();
          return;
        }
        addBubble('error', (r.body && r.body.error) || '답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .catch(function () {
        typing.remove();
        addBubble('error', '네트워크 오류로 답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(function () {
        isSending = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  /* ---------- 상담 신청 (STEP 3의 /api/lead 재사용) ---------- */
  function showLeadForm() {
    if (leadFormOpen) return;
    leadFormOpen = true;

    var box = el('div', 'nc-lead');
    box.appendChild(el('div', 'nc-lead__title', '상담 신청'));
    box.appendChild(el('div', 'nc-lead__desc', '이름과 연락처를 남겨 주시면 영업일 기준 1일 이내에 담당자가 연락드립니다.'));

    var name = el('input');
    name.type = 'text';
    name.placeholder = '이름';
    name.maxLength = 100;
    name.setAttribute('aria-label', '이름');

    var phone = el('input');
    phone.type = 'tel';
    phone.placeholder = '연락처 (010-1234-5678)';
    phone.maxLength = 20;
    phone.setAttribute('aria-label', '연락처');

    var consentId = 'nc-lead-consent-' + Date.now();
    var consentWrap = el('div', 'nc-lead__consent');
    var consent = el('input');
    consent.type = 'checkbox';
    consent.id = consentId;
    var consentLabel = el('label', null,
      '개인정보 수집·이용에 동의합니다. (이름·연락처 / 상담 회신 목적 / 상담 종료 후 1년 보관)');
    consentLabel.setAttribute('for', consentId);
    consentWrap.appendChild(consent);
    consentWrap.appendChild(consentLabel);

    var err = el('p', 'nc-lead__err');
    err.hidden = true;

    var actions = el('div', 'nc-lead__actions');
    var submit = el('button', 'nc-btn', '신청하기');
    submit.type = 'button';
    var cancel = el('button', 'nc-btn nc-btn--ghost', '나중에');
    cancel.type = 'button';
    actions.appendChild(submit);
    actions.appendChild(cancel);

    box.appendChild(name);
    box.appendChild(phone);
    box.appendChild(consentWrap);
    box.appendChild(actions);
    box.appendChild(err);
    log.appendChild(box);
    scrollDown();
    name.focus();

    function fail(msg) {
      err.textContent = msg;
      err.hidden = false;
    }

    cancel.addEventListener('click', function () {
      box.remove();
      leadFormOpen = false;
      input.focus();
    });

    submit.addEventListener('click', function () {
      err.hidden = true;
      var n = name.value.trim();
      var p = phone.value.trim();
      if (!n) return fail('이름을 입력해 주세요.');
      if (p.replace(/\D/g, '').length < 9) return fail('연락처 형식을 확인해 주세요.');
      if (!consent.checked) return fail('개인정보 수집·이용에 동의해 주세요.');

      submit.disabled = true;
      submit.textContent = '접수 중…';

      // 대화 맥락을 문의내용으로 함께 넘긴다 (담당자가 앞뒤를 알 수 있게).
      var transcript = messages
        .map(function (m) { return (m.role === 'user' ? '고객: ' : '챗봇: ') + m.content; })
        .join('\n');

      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: n,
          phone: p,
          consent: true,
          source: '챗봇',
          message: '[챗봇 상담 요청]\n세션: ' + sessionId + '\n\n' + transcript,
          website: ''
        })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { status: res.status, body: body };
          });
        })
        .then(function (r) {
          if (r.status === 200 && r.body.ok) {
            box.remove();
            leadFormOpen = false;
            var done = '접수되었습니다. 영업일 기준 1일 이내에 담당자가 연락드립니다.';
            addBubble('bot', done);
            remember('assistant', done);
            return;
          }
          var e = r.body && r.body.errors;
          fail((e && (e.name || e.phone || e.consent)) ||
            (r.body && r.body.error) ||
            '접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        })
        .catch(function () {
          fail('네트워크 오류로 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        })
        .finally(function () {
          submit.disabled = false;
          submit.textContent = '신청하기';
        });
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    build();
    // 페이지 로드 1초 뒤 환영 메시지를 준비한다. 닫혀 있으면 버튼에 알림 점만 띄운다.
    setTimeout(function () {
      showWelcome();
      if (!isOpen) dot.hidden = false;
    }, WELCOME_DELAY);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
