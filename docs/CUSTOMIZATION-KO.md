# 이름·색상·글꼴 수정 안내

코드를 수정한 뒤에는 `service-worker.js`의 `VERSION` 값을 올리고 저장소 루트를 그대로 배포하세요. 별도 빌드나 `dist/` 폴더는 없습니다.

## 앱 이름

- 브라우저 제목·PWA meta: `index.html`
- 설치 이름·설명: `manifest.webmanifest`
- 화면 브랜드 이름: `assets/js/app.js`의 `Petal Reader`

문자열을 바꿀 때는 세 파일에서 같은 이름을 사용합니다.

## 대표 색상

`assets/css/app.css`의 `:root`:

- `--bg`, `--paper`, `--surface`: 배경·본문 종이
- `--text`, `--muted`: 본문·보조 글자
- `--pink`, `--pink-strong`, `--pink-soft`: Baby Pink 계열
- `--mint`, `--sky`, `--lavender`, `--beige`: 보조 테마
- `--border`, `--shadow`: 경계와 그림자

본문 대비는 4.5:1 이상을 유지하세요. 연한 Baby Pink를 작은 글자나 핵심 아이콘의 단독 색상으로 사용하지 않습니다.

## UI 글씨 크기

`assets/css/app.css`의 노브 하나로 UI 전체가 따라옵니다.

```css
html { font-size: 15px; }
```

나머지 `font-size`는 전부 `rem`입니다. 단, 두 가지는 **의도적으로 절대 px**이며 바꾸지 마세요.

- `input, select, textarea { font-size: 16px }` — 16px 미만이면 iOS Safari가 입력 필드를 탭할 때 화면을 자동 확대합니다.
- `min-height: 44px` 계열과 슬라이더 thumb 크기 — 터치 영역입니다.

## Reader 글꼴 (v1.1.0부터 단일 출처)

폰트 목록의 단일 출처는 **`assets/js/fonts.js`** 입니다. 폰트를 더하거나 뺄 때는 여기만 고치면 `db.js`·`backup.js`·`app.js`·`reader-engine.js`가 함께 따라옵니다.

| 대상 | 위치 |
|---|---|
| 폰트 목록·기본값·수치 범위 | `assets/js/fonts.js` |
| UI `@font-face` (import 불가, 수동 동기화) | `assets/css/app.css` 상단 |
| 오프라인 프리캐시 (import 불가, 수동 동기화) | `service-worker.js`의 `SHELL` / `OPTIONAL_SHELL` |
| 폰트 파일 | `assets/fonts/` |
| 프리셋 | `assets/js/app.js`의 `PRESETS` |
| EPUB 적용 CSS | `assets/js/reader-engine.js`의 `setStyles()` |
| 본문 폭·한/두 페이지 | `assets/js/reader-engine.js`의 `setLayout()` |

**폰트를 목록에서 뺄 때 값을 그냥 지우면 안 됩니다.** 그 값을 가진 기존 백업이 `validateBackup`에서 전부 거부됩니다. 뺄 값은 `fonts.js`의 `LEGACY_FONT_VALUES`로 옮기세요. 검증은 통과시키고 `normalizeReaderPreferences`가 기본값으로 조용히 이관합니다.

새 글꼴을 추가하면 라이선스 파일도 `licenses/`에 넣고 `docs/THIRD-PARTY-NOTICES.md`를 갱신합니다.

`textWidth`는 사용자에게 ch 단위로 표시하지만 paginator에는 현재 글자 크기를 반영한 px로 변환합니다.

## 아이콘

- PWA/홈 화면: `assets/icons/icon-180.png`, `icon-192.png`, `icon-512.png`
- UI SVG: `assets/js/icons.js`
- Petal 브랜드 mark: `assets/js/app.js`의 `flowerMark()`

아이콘을 교체할 때 크기와 manifest 경로를 유지합니다.

## 업데이트 캐시

`service-worker.js`의:

```js
const VERSION = "petal-reader-v1.4.1-portable-ci";
```

배포할 때마다 값을 올립니다. 기존 버전 사용자는 업데이트 배너에서 새 버전을 적용합니다.
