# Petal Reader 구조 안내

Petal Reader는 iPhone·iPad에서 DRM 없는 영문 reflowable EPUB 2/3을 읽는 로컬 우선 PWA입니다. 하이라이트, 메모, 북마크와 사전 기록은 현재 기기의 IndexedDB에 저장하며 JSON 백업과 Obsidian Markdown 내보내기를 지원합니다.

## 주요 폴더

- `index.html`, `manifest.webmanifest`, `service-worker.js`: 앱 셸과 설치·오프라인 동작
- `assets/js/`: 데이터베이스, 백업, 리더, 사전과 화면 로직
- `assets/css/`, `assets/fonts/`, `assets/icons/`, `assets/images/`: 화면 자산
- `dictionary/`: 앱에 포함된 Open English WordNet 데이터
- `vendor/foliate-js/`: 고정된 EPUB 렌더링 엔진
- `licenses/`, `docs/THIRD-PARTY-NOTICES.md`: 제3자 라이선스와 고지
- `docs/USER-GUIDE-KO.md`: 사용·백업·복원 안내
- `docs/GITHUB-PAGES-KO.md`: 배포 안내
- `docs/TEST-REPORT.md`: 검증 결과와 남은 실기기 확인 항목

## 운영 원칙

외부 CDN·사전 API·로그인·분석 서비스 없이 정적 파일만으로 실행합니다. EPUB 원본은 백업 JSON에 포함되지 않으므로 iCloud Drive 등에 별도로 보관해야 합니다. `Published/petal/`만 수정 원본이며, 배포 성공 후 workflow allowlist를 따라 `Backup/petal/`을 다시 만듭니다.
