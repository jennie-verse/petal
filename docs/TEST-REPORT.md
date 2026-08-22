# Petal Reader 검증 보고서

## v1.4.1 자동 검증 보강

- 검증일: 2026-08-22
- `tests/`의 Node 회귀 검사에서 EPUB 콘텐츠 격리, 백업 유효성, 환경설정 이관, Journal 투영, 배포 파일 계약을 검증합니다.
- GitHub Actions는 모든 push에서 회귀 검사와 JavaScript 문법 검사를 통과한 뒤에만 명시적 runtime allowlist를 Pages에 배포합니다.
- Journal 저장소 소유자는 `*.github.io` 배포 hostname에서 계산하므로 계정명을 소스에 고정하지 않습니다.
- 아래 실기기 Pending 항목은 이번 자동화로 대체되지 않습니다.

v1.0.1 검증일: 2026-07-28

아래 "자동·브라우저 검증" 표는 **v1.0.1 기준 결과**입니다. v1.1.0 변경분에 대한 미검증 항목은 문서 후반의 별도 절에 정리했습니다.

## 결과 요약

전체 파일 재감사와 수정 후 코드·브라우저 자동 검증 범위는 통과했습니다. 지원 범위는 사용 목적에 맞춰 **DRM-free reflowable EPUB 전용**으로 확정했습니다. 실제 iPhone/iPad Safari 및 Home Screen PWA, 8–10권의 사용자 EPUB, 50MB 이상 EPUB은 이 환경에서 수행할 수 없어 `Pending`입니다.

## 자동·브라우저 검증

| 항목 | 결과 | 증거 |
|---|---|---|
| JavaScript 문법 | Pass | 모든 `assets/js/*.js`, `service-worker.js` 검사 |
| 페이지 identity/blank/overlay | Pass | 제목 `Petal Reader`, 의미 있는 DOM, framework 오류 overlay 없음 |
| 390×844 서재·빈 서재 | Pass | H1 1개, Import 표시, 가로 overflow 없음 |
| 844×390 | Pass | 가로 overflow 없음, compact landscape Auto 1-page 규칙 |
| 768×1024 | Pass | 가로 overflow 없음 |
| 1024×768 | Pass | 가로 overflow 없음 |
| EPUB 가져오기 | Pass | Moby-Dick fixture, Worker SHA-256, 서재 표시 |
| EPUB Reader 시작 | Pass | `Chapter 1. Loomings.`, Location 22/872 |
| Reader 도구 | Pass | iPhone에서 목차·검색·기록·Aa 4개 |
| 서재 진행률 갱신 | Pass | Reader에서 30% 이동 후 책을 닫자 서재에 즉시 30% 표시 |
| 설정 전체 초기화 | Pass | 자간·테마·읽기 방식 변경 후 Comfortable 전체 기본값 복원 |
| 입력 중 화살표 키 | Pass | 검색 입력에서 좌우 화살표를 눌러도 페이지 위치 유지 |
| 숨겨진 파일 입력 | Pass | 화면 읽기·키보드 목록에서 제외하면서 EPUB 선택 정상 |
| 본문 선택 메뉴 | Pass | Highlight·Note·Dictionary·Copy 4개 |
| 기록 필터 | Pass | Chapter·Color·Order 3개 |
| 저장공간 표시 | Pass | 전체 origin 사용량과 EPUB 복사본 용량을 분리 표시 |
| JSON 백업 | Pass | schema 1, 앱 버전 1.0.1, EPUB·cover Blob 제외 |
| 위험한 백업 거부 | Pass | 안전하지 않은 ID·설정 범위를 적용 전 거부, 기존 서재 유지 |
| JSON 새 저장소 복원 | Pass | 책 1권·북마크 1개 보존, EPUB 재연결 제시 |
| Obsidian Markdown | Pass | YAML, 4개 섹션, 결정적 block ID, 여러 줄 인용·메모 보존 |
| 악성 EPUB script | Pass | script·event handler·javascript link·meta refresh 제거, 부모 문서 변경 없음 |
| EPUB 외부 HTTP 리소스 | Pass | 이미지·CSS 외부 probe 요청 0건 |
| 빠른 회전·설정 전환 | Pass | iframe 교체 중 사라진 요소 스타일 갱신을 안전하게 건너뜀 |
| 터치 영역 | Pass | 현재 화면의 기능성 입력 영역 44×44px 이상 |
| console page error | Pass | 핵심 흐름 page error 0건 |

## 알려진 console 경고

foliate-js paginator는 WebKit 이벤트 호환성 때문에 iframe에 `allow-same-origin allow-scripts`를 함께 사용합니다. Chromium이 이 조합을 경고합니다. Petal Reader는 기존 EPUB CSP를 제한 정책으로 교체하고, script/form/iframe/object/embed, event handler, meta refresh, javascript link, 외부 HTTP(S) 속성과 CSS URL을 제거합니다. 합성 DRM-free 악성 EPUB으로 script 실행, 상위 문서 변경과 외부 요청이 모두 0임을 확인했습니다. 이 경고는 엔진 구조상의 잔여 위험으로 문서화합니다.

의도적으로 잘못된 백업을 넣은 검증에서는 처리된 검증 오류가 console에 기록되지만, 사용자에게 오류 안내를 표시하고 어떤 레코드도 변경하지 않습니다. 정상 핵심 흐름의 page error는 0건입니다.

## 디자인 fidelity ledger

| 비교점 | 결과 |
|---|---|
| Warm White 배경, Baby Pink CTA·진행률 | 일치 |
| Petal mark, Lexend UI, serif 본문 | 일치 (v1.1.0에서 본문 기본 serif는 Georgia) |
| iPhone 서재의 Continue·최근 책·고정 하단 Import 구조 | 일치 |
| Reader 상단 4도구·본문·하단 위치/북마크 | 일치 |
| 설정 프리셋·6테마·상세 조절 | 일치 |
| 기록 4탭·검색·장/색/날짜 필터 | 일치 |
| 선택 메뉴 | 기능·스타일 일치. iOS 선택 핸들 충돌 회피를 위해 선택문 위가 아닌 footer 위 안전 위치 사용 |
| 페이지 표기 | reflowable EPUB 특성상 인쇄 페이지 대신 안정적인 `Location current / total` 사용 |

비교한 승인 콘셉트 (8종). **비교 원본 이미지는 배포 저장소에 포함하지 않습니다.** 파일은 별도 작업 폴더의 `design-concepts/`에 있습니다.

- `01-iphone-library` / `02-iphone-empty-library`
- `03-iphone-reader-selection` / `04-iphone-landscape-reader`
- `05-ipad-portrait-settings` / `06-ipad-landscape-records`
- `07-iphone-search-contents` / `08-ipad-backup-restore`

## v1.1.0 검증

검증일: 2026-07-28. jsdom + fake-indexeddb 위에서 앱을 실제로 부팅해 사용자 흐름을 조작하는 방식으로 **94건**을 수행했습니다.

| # | 항목 | 결과 | 관련 변경 |
|---|---|---|---|
| 1 | `<head>` 없는 XHTML에도 CSP 주입, 주입 지점이 없으면 렌더링 포기 | Pass | 1단계 |
| 2 | 프로토콜 상대 URL(`//host/x.png`) 외부 요청 차단 | Pass | 1단계 |
| 3 | XML 프롤로그·DOCTYPE·여러 줄 속성·대문자 태그·주석·BOM 문서 정상 처리 | Pass | 1단계 |
| 4 | SVG 콘텐츠 문서는 CSP 주입 대상에서 제외되고 그대로 통과 | Pass | 1단계 |
| 5 | 책 내부 상대 경로(`images/x.jpg`, `ch2.xhtml`)는 보존 | Pass | 1단계 |
| 6 | merge·replace 복원 후 표지 Blob과 로컬 `activeFileHash` 유지 | Pass | 2단계 |
| 7 | 로컬에 없는 책은 표지 `null`, 백업의 해시 사용 | Pass | 2단계 |
| 8 | 호출부가 옛 `updatedAt`을 보내도 새 값이 이김 | Pass | 4단계 |
| 9 | 메모 저장 시 `id`·`createdAt`·`quote`·`locator` 보존, `revision` 증가 | Pass | 4·5단계 |
| 10 | 하이라이트 메모가 Notes 탭·Obsidian Highlights 섹션·JSON 백업에 포함 | Pass | 5단계 |
| 11 | 메모 없는 하이라이트는 Notes 탭에 나오지 않음 | Pass | 5단계 |
| 12 | 따옴표·`&` 포함 메모가 escape 왕복에서 깨지지 않음 | Pass | 5단계 |
| 13 | 빈 서재에서 Add to Home Screen 안내 제거, 온보딩 3단계는 유지 | Pass | 6단계 |
| 14 | 슬라이더 드래그 중 시트 재생성 없음 (스크롤·포커스 유지) | Pass | 7단계 |
| 15 | 드래그 중 DB 미기록, 종료 시 1회 저장 | Pass | 7단계 |
| 16 | 화살표 키 연타 시 DB 쓰기가 1회로 합쳐짐 | Pass | 7단계 |
| 17 | 토글·테마·프리셋 재렌더 후에도 스크롤 위치 유지 | Pass | 7단계 |
| 18 | 폰트 선택지 6종, 라벨에 따옴표 없음, 구 폰트 미노출 | Pass | 9단계 |
| 19 | 구 폰트 값 백업이 거부 없이 통과 후 Georgia로 자동 이관 | Pass | 9단계 |
| 20 | 알 수 없는 폰트 값은 여전히 거부 | Pass | 9단계 |
| 21 | 기본 폰트 크기 16, 최소 12 유지 | Pass | 10단계 |
| 22 | `fonts.js`·`app.css`·`service-worker.js` 폰트 목록 3곳 일치 | Pass | 9단계 |

34행 "EPUB 외부 HTTP 리소스 · 외부 probe 요청 0건"은 절대 URL만 시험한 결과였습니다. 위 2번으로 재검증했습니다.

### 실기기에서만 확인 가능 (Pending)

| # | 항목 | 관련 변경 |
|---|---|---|
| 1 | OpenDyslexic·Comic Neue가 iPhone에서 실제 적용되는가 (fallback으로 떨어지지 않는가) | 9단계 |
| 2 | Verdana·Georgia가 의도한 서체로 나오는가 | 9단계 |
| 3 | 슬라이더 thumb 터치 영역이 손가락으로 충분한가 | 7단계 |
| 4 | 글씨 축소 후에도 모든 버튼이 물리적으로 44×44px 이상인가 | 8단계 |
| 5 | 검색창·메모 textarea를 탭할 때 화면이 자동 확대되지 않는가 | 8단계 |
| 6 | VoiceOver로 서재 목록과 설정 슬라이더가 읽히는가 | — |

## Pending

- 실제 iPhone Safari 탭과 Home Screen 앱
- 실제 iPad 세로·가로와 두 페이지
- VoiceOver 실제 기기 낭독·포커스
- 키보드가 열린 iOS Safe Area
- 서로 다른 출판사 EPUB 8–10권
- 50MB 이상·이미지 많은 EPUB
- 실제 iCloud Drive Share Sheet 저장·재선택
- GitHub Pages production Service Worker 업데이트
- fixed-layout 상용 파일의 실제 오류 메시지

위 Pending 항목은 통과했다고 주장하지 않습니다. 사용자 기기 체크리스트로 최종 확인해야 합니다.
