# 폰트 파일 안내

이 폴더에는 번들 폰트 파일이 들어갑니다. 목록의 단일 출처는 `assets/js/fonts.js`의 `BUNDLED_FONT_FACES`입니다.

## 현재 포함된 파일

| 파일 | 용도 |
|---|---|
| `Lexend-Variable.woff2` | UI 기본 서체 · 본문 선택지 (2026-09-02: TTF 175KB → WOFF2 72KB로 교체) |
| `AtkinsonHyperlegible-Regular.ttf` | 본문 선택지 |
| `AtkinsonHyperlegible-Bold.ttf` | 위 폰트의 Bold |

## 직접 추가하셔야 하는 파일 (v1.1.0)

아래 4개는 네트워크 제한으로 자동 내려받지 못했습니다. **파일명을 정확히 맞춰** 이 폴더에 넣으시면 코드 수정 없이 바로 동작합니다.

| 파일명 | 받는 곳 |
|---|---|
| `OpenDyslexic-Regular.woff2` | https://opendyslexic.org/ |
| `OpenDyslexic-Bold.woff2` | 〃 |
| `ComicNeue-Regular.woff2` | https://comicneue.com/ |
| `ComicNeue-Bold.woff2` | 〃 |

두 폰트 모두 SIL Open Font License 1.1이며, 라이선스 사본은 `licenses/OpenDyslexic-OFL.txt`와 `licenses/ComicNeue-OFL.txt`에 이미 들어 있습니다.

### TTF/OTF만 구하셨다면

WOFF2로 변환하시면 용량이 약 1/3로 줄어듭니다.

```bash
pip install fonttools brotli
fonttools ttLib.woff2 compress -o OpenDyslexic-Regular.woff2 OpenDyslexic-Regular.otf
```

`.ttf`나 `.otf`를 그대로 쓰시려면 세 곳의 확장자를 함께 바꾸세요.

1. `assets/js/fonts.js` → `BUNDLED_FONT_FACES`
2. `assets/css/app.css` → 상단 `@font-face` 블록
3. `service-worker.js` → `OPTIONAL_SHELL`

### 파일이 없을 때의 동작

앱은 정상 동작합니다. 서비스 워커는 이 4개를 개별 캐시하며 실패를 무시하고, 브라우저는 CSS fallback 체인의 다음 서체로 넘어갑니다.

- OpenDyslexic → Verdana
- Comic Neue → Comic Sans MS → cursive

다만 **iOS에는 Comic Sans MS가 기본 탑재되어 있지 않으므로**, 파일을 넣지 않으면 Comic Neue 선택 시 시스템 cursive 서체가 나옵니다.
