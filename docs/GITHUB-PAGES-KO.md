# GitHub Pages 배포 안내

Petal Reader는 GitHub 외의 호스팅·API·CDN을 사용하지 않도록 구성되어 있습니다.

빌드 단계와 `dist/` 폴더가 없는 정적 앱입니다. 현재 저장소는 `.github/workflows/deploy.yml`에서 회귀 검사와 JavaScript 문법 검사를 통과한 뒤 runtime allowlist만 GitHub Pages에 배포합니다. `tests/`, `package.json`, `.github/`는 공개 artifact에 포함하지 않습니다.

## 현재 저장소 업데이트

1. `Published/petal/`에서 수정합니다.
2. `npm test`와 `npm run test:syntax`를 실행합니다.
3. `main`에 push하면 `Test and deploy Petal` workflow가 테스트 후 Pages를 배포합니다.
4. GitHub `Settings` → `Pages`의 Source는 **GitHub Actions**로 유지합니다.
5. Actions의 `test`와 `deploy`가 모두 성공한 뒤 공개 주소를 확인합니다.

## 새 계정에 Backup을 수동 복원하는 방법

1. GitHub에서 새 저장소를 만듭니다.
2. `WebApp/Backup/petal/` 폴더의 **내용 전체**를 저장소 루트에 업로드합니다 (`petal` 폴더째로 올리지 마세요).
3. `Settings` → `Pages`로 이동합니다.
4. Source를 `Deploy from a branch`로 선택합니다.
5. Branch `main`, Folder `/ (root)`를 선택하고 저장합니다.
6. 안내된 주소를 Safari에서 엽니다.

`.nojekyll`을 반드시 유지해야 `_`로 시작하는 로컬 사전 파일도 게시됩니다.

## 업데이트 배포

`service-worker.js`의 `VERSION`을 올려야 기존 기기의 캐시가 갱신됩니다. 값을 그대로 두면 업데이트 배너가 뜨지 않습니다.

```js
const VERSION = "petal-reader-v1.4.4-journal-redaction";
```

`assets/js/backup.js`의 `APP_VERSION`도 같은 의미 버전(`1.4.4`)으로 맞추세요. Service Worker 값에는 앱 이름과 배포 식별자 접두·접미사가 추가될 수 있습니다. `APP_VERSION`은 백업 JSON과 Obsidian YAML에 기록됩니다.

## 주소 고정

GitHub 사용자명, 저장소 이름, custom domain을 바꾸면 origin이 달라져 기존 IndexedDB가 보이지 않을 수 있습니다. 변경 전:

1. 기존 주소에서 JSON 백업
2. 새 주소 배포
3. 홈 화면 앱 재설치
4. 새 주소에서 JSON 복원과 EPUB 재연결

## 배포 후 확인

- Petal Reader 서재가 빈 화면 없이 열림
- `manifest.webmanifest`가 200 응답
- 아이콘 180/192/512px 표시
- EPUB 가져오기 성공
- 로컬 사전 정의 표시
- 홈 화면 추가 후 독립 창 실행 (Safari 공유 → `홈 화면에 추가`)
- 새 버전 배포 시 업데이트 배너 표시

## 외부 서비스 사용 여부

- 허용: GitHub 저장소, GitHub Pages
- 사용하지 않음: npm CDN, Google Fonts, 외부 사전 API, 분석, 광고, 로그인, 별도 서버
- EPUB 내부의 외부 HTTP(S) 리소스와 스크립트는 Reader에서 제거·차단
