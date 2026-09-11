# Helloinsa Design System (v0.1)

helloinsa.co.kr(헬로인사 — 급여 아웃소싱 전문, Since 1999)을 조사해 정리한 별도 디자인시스템.
Hellopay Design System(제품 어드민용)과는 분리된 **기업 마케팅 사이트용** 시스템이다.

## 조사 범위와 한계
- 확인함: 홈, 회사소개 페이지의 정보 구조·카피·섹션 리듬·콘텐츠 위계 (helloinsa.co.kr, 2026-09 기준).
- 확인 못 함: 스타일시트·로고 SVG·이미지 파일(직접 열람 불가). **색상값과 폰트는 브랜드 성격에 맞춰 정의한 값**이며, 실제 사이트 캡처를 주시면 정확한 값으로 교체 가능하다.

## 브랜드 성격
27년 업력, ISO27001, 2,000+ 고객사. 키워드는 **정확성 · 신뢰 · 무결점**.
톤은 차분하고 단정하며, 숫자로 말한다. 과장·감탄부호·이모지 없음.

## 콘텐츠 규칙 (사이트에서 관찰)
- 섹션은 항상 **작은 영문/한글 eyebrow → 큰 한글 헤드라인 → 한 줄 리드** 순서.
  예: `서비스` → `스타트업부터 대기업까지, 유연한 확장성`.
- 서비스 카드는 **영문 카테고리(Payroll Processing) + 한글 제목 + 설명 + 키워드 칩 3개** 구조.
- 신뢰 지표는 큰 숫자 + 짧은 라벨(`2000+ 도입 고객사`, `27년 업력`, `99.9% 처리 정확도`).
- 연혁은 `기간 → 소제목 → 항목 리스트` 타임라인.
- 한국어 우선, 존댓말 서술체(`~합니다`). 영문은 카테고리 라벨과 고유명사에만.

## 색
| 역할 | 값 |
| --- | --- |
| Navy 900 (히어로·푸터 바탕) | `#08182F` |
| Navy 800 / 700 | `#0F2A4E` / `#163A68` |
| Brand Blue 600 (주 액션) | `#1B4DE4` |
| Blue 500 hover / 700 press | `#3C68EA` / `#143CB4` |
| Blue 100 / 50 (연한 강조면) | `#D9E2FD` / `#EEF3FE` |
| Heritage Gold 500 / 50 | `#C08A2E` / `#FBF3E4` |
| Ink 1–4 | `#14181F` `#414852` `#6B7280` `#9AA1AC` |
| Line / Line soft | `#E4E7EC` / `#EFF1F4` |
| Surface / Surface 2 | `#FFFFFF` / `#F7F8FA` |

네이비는 히어로·CTA 밴드·푸터 등 **면**으로, 블루는 **액션과 강조 단어**로, 골드는 업력·연혁 숫자에만 소량.
그라데이션 없음. 한 화면에 바탕색은 2개까지.

## 타이포
- Pretendard (한/영 공통), 숫자는 Inter.
- Display 56 / 44, Heading 34 / 26 / 20, Body 17 / 15, Detail 13, Eyebrow 12(대문자·letter-spacing 0.08em).
- 제목 700, 강조 600, 본문 500. 제목 letter-spacing −0.02em, 행간 1.3 / 본문 1.75.

## 레이아웃·형태
- 컨테이너 1160px, 좌우 여백 40px. 섹션 상하 패딩 112px.
- 4px 그리드. 카드 내부 32px.
- Radius: 6 / 10(버튼·필드) / 16(카드) / 24(큰 패널) / full(칩).
- 그림자는 파랑기 있는 약한 값 3단계. 카드는 기본 평면 + 호버 시 2px 상승.
- 모션 140ms `cubic-bezier(.4,0,.2,1)`, 배경색·그림자·2px 이동만.

## 컴포넌트 (`components.jsx`, `window.HelloinsaDS`)
`Eyebrow` · `SectionHead` · `Button`(primary/navy/outline/onDark/ghostOnDark × sm/md/lg, `arrow` 옵션) ·
`Tag` · `Card`(surface/muted/navy, hoverable) · `Stat` · `InfoRow` · `StepRow` · `Divider`

## 사용법
```html
<helmet>
  <link rel="stylesheet" href="helloinsa-ds/tokens.css">
</helmet>
<x-import component-from-global-scope="HelloinsaDS.Button" from="./helloinsa-ds/components.jsx"
          variant="primary" size="lg" href="#contact" arrow="{{ true }}" hint-size="auto,56px">
  서비스 도입 문의하기
</x-import>
```
