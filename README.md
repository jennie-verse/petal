# Petal Reader

Petal Reader는 iPhone·iPad에서 DRM 없는 영문 EPUB을 읽고, 하이라이트·메모·북마크·단어를 기기 안에 저장한 뒤 JSON 또는 Obsidian Markdown으로 내보내는 개인용 PWA입니다.

현재 버전은 `1.1.0`입니다.

## 중요한 운영 원칙

- 배포는 **GitHub Pages만** 사용합니다.
- 앱 실행 중 필요한 파일은 모두 같은 GitHub Pages 주소에서 불러옵니다.
- 사전은 Open English WordNet 2025를 앱에 포함한 로컬 영영 사전입니다. 외부 사전 API·CDN·로그인·광고·분석 서비스가 없습니다.
- EPUB 원본은 사용자가 iCloud Drive에 보관합니다. 앱은 선택한 EPUB의 독서용 복사본을 현재 기기의 IndexedDB에 저장합니다.
- iPhone과 iPad는 자동 동기화되지 않습니다. JSON 백업으로 수동 이동합니다.
- 백업에는 EPUB 파일이 포함되지 않습니다.

## 지원 범위

- 지원: DRM 없는 영문 reflowable EPUB 2/3 전용
- 제외: DRM, fixed-layout, 세로쓰기, RTL, PDF, MOBI
- 읽기: 페이지 방식, 장 단위 스크롤, iPad 가로 2페이지, 글꼴·크기·간격·여백·테마
- 기록: 북마크, 5색 하이라이트, 메모, 로컬 영영 사전, 한국어 개인 메모
- 보관: JSON 전체 기록 백업·복원, 책별 Obsidian Markdown

## 폴더 안내

저장소 루트가 곧 배포본입니다. 빌드 단계나 `dist/` 폴더는 없습니다.

- `index.html`, `manifest.webmanifest`, `service-worker.js`, `.nojekyll`: 루트 배포 파일
- `assets/js/`: 앱 모듈 (`app.js`, `db.js`, `backup.js`, `reader-engine.js`, `fonts.js`, `dictionary.js`, `icons.js`, `hash-worker.js`)
- `assets/css/app.css`, `assets/fonts/`, `assets/icons/`, `assets/images/`: UI 자산
- `licenses/`: 오픈소스·폰트·사전 라이선스 사본
- `docs/USER-GUIDE-KO.md`: 사용자 안내서
- `docs/GITHUB-PAGES-KO.md`: GitHub Pages 배포 안내
- `docs/TEST-REPORT.md`: 검증 결과와 남은 제한
- `docs/THIRD-PARTY-NOTICES.md`: 오픈소스·폰트·사전 고지
- `docs/CUSTOMIZATION-KO.md`: 이름·색상·글꼴 수정 위치
- `vendor/foliate-js/`: 고정된 EPUB 렌더링 엔진
- `dictionary/`: 앱에 포함된 Open English WordNet 데이터

## 기술 구조

최종 실행본은 npm, CDN, 외부 빌드 서비스 없이 GitHub Pages에서 그대로 실행되는 정적 HTML·CSS·JavaScript ES module 구조입니다. 초기 계획의 React/Vite 대신 이 구조를 채택해 외부 패키지 저장소와 별도 호스팅 의존성을 제거했습니다. 데이터·백업·보안·PWA·Reader 기능 명세는 유지합니다.

## 바로 시작하기

1. [GitHub Pages 안내](docs/GITHUB-PAGES-KO.md)에 따라 저장소 루트를 그대로 배포합니다.
2. iPhone/iPad Safari에서 고정된 배포 주소를 엽니다.
3. 공유 버튼 → `홈 화면에 추가`를 선택합니다.
4. 홈 화면의 Petal Reader에서 첫 EPUB을 가져옵니다.
5. 읽기 기록을 만든 뒤 `Backup & storage`에서 JSON 백업을 저장합니다.

## 개인정보와 백업

모든 독서 기록은 현재 브라우저 저장소에 남습니다. JSON과 Markdown은 암호화되지 않은 평문이며 인용문과 개인 메모를 포함합니다. Safari 데이터 삭제, 저장 공간 압박, 배포 주소 변경 전에 반드시 JSON 백업을 만드세요.
